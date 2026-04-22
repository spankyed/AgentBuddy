/**
 * Claude Code Chat — the main conversational action.
 *
 * Starts a Claude Code CLI query, stores the handle, and kicks off a
 * fire-and-forget stream consumer that processes events in the background.
 * The action returns immediately so the brain's step actor is not blocked
 * for the duration of the CLI session.
 *
 * Stream processing, tool-activity tracking, control_request handling,
 * diff artifact creation, and queued-message drain all live in
 * `_helpers/stream-consumer.ts`.
 *
 * Triggered from the "Claude Code" flow when a user.message arrives with
 * `mode === 'work'`.
 */

import type { ActionMeta, Services, Z, EntityId } from '../../types';
import { createStreamWriter } from './_helpers/stream-writer';
import { createToolActivityWriter } from './_helpers/tool-activity-writer';
import { ensureSessionArtifact, updateSessionArtifact, updateChatState, readSessionPermissionMode, readWorktreeMode, extractStaleSessionId, markSessionBroken, readSessionCwd } from './_helpers/session-artifact';
import { getClaudeState, persistClaudeState, setRunning, enqueueMessage, killTurn, clearSessionId } from './_helpers/thread-context';
import { consumeStream } from './_helpers/stream-consumer';

export const meta: ActionMeta = {
  label: 'Claude Code Chat',
  description: 'Drives Claude Code in streaming mode for the current thread, resuming prior sessions and prompting the user for tool permissions.',
  category: 'claude-code',
  input: {
    threadId: { type: 'string', description: 'Target thread', required: true },
    text: { type: 'string', description: 'User message text', required: true },
    mode: { type: 'string', description: 'Agent mode (passed through from user.message)', required: false },
    phase: { type: 'string', description: 'Sub-phase within mode (plan/edit/review)', required: false },
    model: { type: 'string', description: 'Override Claude model (alias or full id)', required: false },
    allowedTools: { type: 'array', description: 'Tools allowed without prompting', required: false },
    disallowedTools: { type: 'array', description: 'Tools always denied', required: false },
    systemPrompt: { type: 'string', description: 'Extra system prompt to append', required: false },
    messageId: { type: 'string', description: 'User message entity ID (for queued-state UI)', required: false },
  },
};

/**
 * Tools auto-approved without prompting — matches the CLI's `isReadOnly()` set.
 * With `--permission-prompt-tool stdio`, the CLI delegates ALL permission
 * decisions to our wrapper. Without this list, every read-only tool would
 * trigger an approval block.
 *
 * Excludes AskUserQuestion/ExitPlanMode (handled via control_request flow)
 * and Brief/SyntheticOutput (internal coordinator signals).
 */
const DEFAULT_ALLOWED_TOOLS = [
  'Read', 'Glob', 'Grep',
  'WebSearch', 'WebFetch',
  'Agent',
  'ToolSearch',
  'TaskList', 'TaskGet', 'TaskOutput',
  'CronList',
  'LSP',
  'ListMcpResources', 'ReadMcpResource',
  // 'EnterPlanMode', // TODO: need control_request to sync plan mode state with app UI
  'SyntheticOutput',
  // NOT AskUserQuestion or ExitPlanMode — we need control_requests for those
  // to show question blocks and plan approval blocks.
];

const PHASE_TIP_PROMPTS: Record<string, string> = {
  plan: 'Plan Phase Tips System',
  edit: 'Edit Phase Tips System',
};

export async function action(
  params: Record<string, any>,
  services: Services,
  _z: Z,
  _flowId: string,
) {
  const {
    threadId,
    text,
    phase,
    model,
    allowedTools,
    disallowedTools,
    systemPrompt,
    messageId: userMessageId,
    references,
  } = params as {
    threadId: EntityId;
    text: string;
    mode?: string;
    phase?: string;
    model?: string;
    allowedTools?: string[];
    disallowedTools?: string[];
    systemPrompt?: string;
    messageId?: string;
    references?: any;
  };

  const log = services.logger;
  log.debug('chat action invoked', { threadId, mode: params.mode, phase, textLen: text?.length });

  if (!threadId || !text?.trim()) {
    return { success: false, error: 'threadId and text are required' };
  }

  // Resume any prior conversation parked on this thread.
  const prior = getClaudeState(services, threadId);
  const resumeSessionId = prior?.sessionId;
  let forkFrom = prior?.forkFrom;
  let revertTo = prior?.revertTo;

  // Guard: fork/revert requires a valid sessionId to resume from.
  // If sessionId is missing (race with stream-consumer), drop the
  // fork/revert intent and start a fresh session instead.
  if ((forkFrom || revertTo) && !resumeSessionId) {
    log.warn('[revert-guard] fork/revert requested but no sessionId — starting fresh', {
      threadId,
      hadForkFrom: !!forkFrom,
      hadRevertTo: !!revertTo,
      revertCliUuid: revertTo?.cliUuid ?? null,
      forkCliUuid: forkFrom?.cliUuid ?? null,
      fullPriorState: JSON.stringify(prior ?? {}),
    });
    persistClaudeState(services, threadId, {
      revertTo: undefined,
      forkFrom: undefined,
    });
    forkFrom = undefined;
    revertTo = undefined;
  }

  log.debug('resume state resolved', {
    resumeSessionId: resumeSessionId ?? null,
    fork: !!forkFrom,
    revert: revertTo?.cliUuid ?? null,
  });

  // ─── Concurrency guard ──────────────────────────────────────────────
  if (prior?.isRunning) {
    log.debug('action already running — queuing message', { threadId });
    enqueueMessage(services, threadId, { text, mode: params.mode as string, phase, messageId: userMessageId, references });
    if (userMessageId) {
      services.chat.updateMessageState(userMessageId as any, { status: 'queued' } as any);
    }
    return { success: true, queued: true };
  }

  // If the turn is paused on a permission prompt (isRunning=false but
  // pendingControlRequest exists), kill the old CLI process so the old
  // consumer exits cleanly, then proceed with this message as a new turn.
  if (prior?.pendingControlRequest) {
    log.debug('killing paused turn to start new one', { threadId });
    killTurn(services, threadId);
  }

  // Mark this thread as having an active turn.
  setRunning(services, threadId, true);

  // Disable fork on user messages in Claude Code threads. Forking from a
  // user message creates a mismatch: the app shows the message but the CLI
  // session truncates to the preceding assistant message, so the LLM has
  // no knowledge of what the user said. Only assistant messages (which
  // carry cliUuid) are safe fork points.
  if (userMessageId) {
    services.chat.updateMessageState(userMessageId as any, { forkable: false } as any);
  }

  // ─── CWD check — prompt for directory if none configured ────────────
  // Runs before the placeholder message so the empty bubble never appears.
  const codeSettings = services.repository.settingsQueries.getPluginSettings('code') as any;
  const hasCwd = codeSettings?.defaultBaseDirectory || codeSettings?.lastDirectoryOpened;
  if (!hasCwd) {
    const projects = (services.repository.settingsQueries.getGeneralSettings('projects') as any[]) || [];
    const blocks: any[] = [
      { type: 'prompt', props: { content: 'Select a project directory' } },
    ];
    blocks.push({
      type: 'project-select',
      props: { projects },
    });
    blocks.push(
      { type: 'file-picker', props: { fileType: 'directory' } },
      { type: 'toggles', props: { toggles: [
        { id: 'worktree', label: 'Worktree', description: 'Isolated file mutations', default: false },
      ] } },
    );
    const picker = services.chat.sendBlockMessage({
      threadId,
      text: 'Which project directory should I work in?',
      blocks,
      forkable: false,
      autoHide: true,
      asideContext: 'Project',
    });
    persistClaudeState(services, threadId, {
      pendingDirectorySelect: {
        pickerMessageId: picker.messageId as string,
        text,
        mode: params.mode,
        phase,
        model,
        allowedTools,
        disallowedTools,
        systemPrompt,
        messageId: userMessageId,
        references,
      },
    });
    setRunning(services, threadId, false);
    return { success: true, awaitingDirectory: true };
  }

  // Create the placeholder assistant message we'll stream into.
  // Shows "Thinking…" until the first text delta arrives and the stream
  // writer overwrites it. Non-forkable while streaming.
  const currentMessageId = services.chat.sendBlockMessage({
    threadId,
    text: 'Thinking…',
    blocks: [],
    forkable: false,
  }).messageId;
  log.debug('placeholder message created', { messageId: currentMessageId });

  const writer = createStreamWriter(services, currentMessageId, { intervalMs: 80 });
  const toolActivity = createToolActivityWriter(services, currentMessageId, { intervalMs: 250, phase });

  // Upsert the thread's claude-session artifact.
  ensureSessionArtifact(services, threadId, {
    chatState: 'working',
    startedAt: Date.now(),
  });
  // Clear any prior session error (ensureSessionArtifact only applies
  // initial content on creation, not on existing artifacts).
  updateSessionArtifact(services, threadId, { sessionError: undefined });
  updateChatState(services, threadId, 'working');

  // Read the user's current permission-mode and worktree choices.
  const activePermissionMode = readSessionPermissionMode(services, threadId);
  const effectivePermissionMode = phase === 'plan' ? 'plan' : activePermissionMode;
  const useWorktree = readWorktreeMode(services, threadId);
  log.debug('active settings', { permissionMode: effectivePermissionMode, worktree: useWorktree });

  // Phase-aware system-prompt nudging (plan/edit/review).
  const tipLabel = phase ? PHASE_TIP_PROMPTS[phase] : undefined;
  const phaseTip = tipLabel ? services.prompt.usePrompt(tipLabel, {}) : undefined;
  const composedSystemPrompt = [phaseTip, systemPrompt].filter(Boolean).join('\n\n') || undefined;

  // Clear one-shot flags before the query — their purpose is consumed the
  // moment we read them. If the query throws, we don't want the next turn
  // to re-fork or re-revert.
  if (forkFrom || revertTo) {
    persistClaudeState(services, threadId, {
      ...(forkFrom && { forkFrom: undefined }),
      ...(revertTo && { revertTo: undefined }),
    });
  }

  // ─── Fire the query ─────────────────────────────────────────────────
  let sessionCwd: string | undefined; // TODO: remove — hoisted for debug logging in catch block
  try {
    // Resolve references inside try/catch so a failure doesn't permanently
    // lock the thread in isRunning=true.
    const resolved = await services.chat.resolveReferences(references);
    const fullText = resolved.textPrefix ? `${resolved.textPrefix}\n\n${text}` : text;
    let prompt: any = fullText;
    if (resolved.imageBlocks.length > 0) {
      prompt = {
        type: 'user',
        message: { role: 'user', content: [{ type: 'text', text: fullText }, ...resolved.imageBlocks] },
        parent_tool_use_id: null,
      };
    }

    const addDirs = [...new Set([...(prior?.additionalDirs ?? []), ...(resolved.addDirs ?? [])])];

    log.debug('invoking claudeCode.query', {
      model,
      resumeSessionId: resumeSessionId ?? null,
      revertTo: revertTo?.cliUuid ?? null,
      forkFrom: forkFrom?.cliUuid ?? null,
      forkSession: !!(forkFrom || revertTo),
      permissionMode: effectivePermissionMode,
      hasSystemPrompt: !!composedSystemPrompt,
      imageCount: resolved.imageBlocks.filter((b: any) => b.type === 'image').length,
      fileCount: references?.files?.length ?? 0,
      contextCount: references?.context?.length ?? 0,
    });
    // When resuming, use the CWD where the session was originally created so
    // the CLI can locate the session JSONL in the correct project bucket.
    sessionCwd = resumeSessionId ? readSessionCwd(services, threadId) : undefined;
    if (resumeSessionId && !sessionCwd) {
      log.warn('[resume] sessionId exists but sessionCwd is missing — CLI will use process.cwd()', {
        threadId, resumeSessionId, revertTo: revertTo?.cliUuid ?? null,
      });
    }

    const handle = await services.cli.claudeCode.query({
      ...(sessionCwd && { cwd: sessionCwd }),
      prompt,
      resume: resumeSessionId,
      model,
      includePartialMessages: true,
      permissionMode: effectivePermissionMode,
      allowedTools: allowedTools ?? DEFAULT_ALLOWED_TOOLS,
      disallowedTools,
      appendSystemPrompt: composedSystemPrompt,
      surfaceControlRequests: true,
      env: { CLAUDE_CODE_COORDINATOR_MODE: '1' },
      ...(useWorktree && { worktree: true }),
      ...(addDirs.length > 0 && { addDir: addDirs }),
      // Fork/revert: create a new CLI session JSONL file, truncated to the
      // fork/revert point via --resume-session-at.
      ...((forkFrom || revertTo) && { forkSession: true }),
      ...(revertTo && { resumeSessionAt: revertTo.cliUuid }),
      ...(forkFrom?.cliUuid && { resumeSessionAt: forkFrom.cliUuid }),
    } as any);

    // Store the handle so "CC: Route Response" and the stream consumer
    // can write control_responses back to the CLI's stdin.
    (services.cli as any).claudeCode.storeHandle(threadId, handle);

    log.debug('query handle received, kicking off stream consumer');

    // Fire-and-forget: the stream consumer runs in the background,
    // processing events until the CLI stream ends. The action returns
    // immediately so the brain's step actor is freed.
    consumeStream(handle, { services, threadId, text, phase, userMessageId }, {
      writer, toolActivity, messageId: currentMessageId as EntityId,
    }).catch((err) => {
      // Safety net — consumeStream has its own try/catch, but guard
      // against truly unexpected escapes. Mirror its cleanup path.
      log.error('consumeStream escaped error boundary', { err: err?.message });
      (services.cli as any).claudeCode.clearHandle(threadId);
      setRunning(services, threadId, false);
      updateChatState(services, threadId, 'idle');
      services.emitter.sendToPlugin('threads', {
        type: 'FLASH_CHAT_STATE', threadId, stateId: 'error', durationMs: 3000,
      });
    });

    return { success: true, streaming: true };
  } catch (err: any) {
    const message = err?.message || 'Claude Code query failed to start';
    log.error('chat action failed to start query', { message, stack: err?.stack });
    toolActivity.finalise('error');
    setRunning(services, threadId, false);

    // ─── Session-not-found: clear stale sessionId, mark artifact broken ──
    const staleId = extractStaleSessionId(message);
    if (staleId) {
      log.error('[session-expired] stale session detected', {
        threadId,
        staleId,
        resumeSessionId: resumeSessionId ?? null,
        sessionCwd: sessionCwd ?? null,
        hadRevertTo: !!revertTo,
        hadForkFrom: !!forkFrom,
        cliError: message,
      });
      const userMessage = 'Session expired — the conversation file was deleted or is invalid. Your next message will start a fresh session.';
      writer.finalize(`⚠️ ${userMessage}`);
      clearSessionId(services, threadId);
      markSessionBroken(services, threadId, `Session ${staleId} not found`);
      return { success: false, error: userMessage, messageId: currentMessageId };
    }

    // ─── Generic error (existing behavior) ───────────────────────────────
    updateChatState(services, threadId, 'idle');
    services.emitter.sendToPlugin('threads', {
      type: 'FLASH_CHAT_STATE', threadId, stateId: 'error', durationMs: 3000,
    });
    writer.finalize(`⚠️ ${message}`);
    return { success: false, error: message, messageId: currentMessageId };
  }
}
