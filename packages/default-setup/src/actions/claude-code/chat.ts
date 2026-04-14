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
import { ensureSessionArtifact, updateSessionArtifact, readSessionPermissionMode } from './_helpers/session-artifact';
import { getClaudeState, persistClaudeState, setRunning, enqueueMessage } from './_helpers/thread-context';
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

/** Read-only tools that auto-pass — users shouldn't have to approve a Read. */
const DEFAULT_ALLOWED_TOOLS = ['Read', 'Glob', 'Grep'];

const PHASE_HINTS: Record<string, string> = {
  plan: 'You are in the PLAN phase. Focus on strategy, task breakdown, and clarifying questions. Avoid making file changes unless explicitly asked.',
  edit: 'You are in the EDIT phase. Implement the agreed-upon plan. Prefer small, focused edits.',
  review: 'You are in the REVIEW phase. Critically audit the recent changes. Point out bugs, regressions, and unhandled edge cases.',
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
    references?: { images?: Array<{ url: string; name: string }> };
  };

  const log = services.logger;
  log.debug('chat action invoked', { threadId, mode: params.mode, phase, textLen: text?.length });

  if (!threadId || !text?.trim()) {
    return { success: false, error: 'threadId and text are required' };
  }

  // Resume any prior conversation parked on this thread.
  const prior = getClaudeState(services, threadId);
  const resumeSessionId = prior?.sessionId;
  const forkFrom = prior?.forkFrom;
  const revertTo = prior?.revertTo;
  log.debug('resume state resolved', {
    resumeSessionId: resumeSessionId ?? null,
    fork: !!forkFrom,
    revert: revertTo?.cliUuid ?? null,
  });

  // ─── Concurrency guard ──────────────────────────────────────────────
  if (prior?.isRunning) {
    log.debug('action already running — queuing message', { threadId });
    enqueueMessage(services, threadId, { text, mode: params.mode as string, phase, messageId: userMessageId });
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
    const oldHandle = (services.cli as any).claudeCode.getHandle(threadId);
    if (oldHandle) {
      oldHandle.kill();
      (services.cli as any).claudeCode.clearHandle(threadId);
    }
    // Invalidate the stale interactive block so it's greyed out in the UI.
    services.chat.updateMessageState(prior.pendingControlRequest.approvalMessageId as any, {
      responseTimestamp: Date.now(),
      blockResponse: { cancelled: true },
    } as any);
    persistClaudeState(services, threadId, { pendingControlRequest: undefined });
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

  // Create the empty assistant message we'll stream into.
  // Non-forkable while streaming — partial responses are confusing fork points.
  // Flipped back to forkable on finalize (stream-consumer.ts).
  const currentMessageId = services.chat.sendBlockMessage({
    threadId,
    text: '',
    blocks: [],
    forkable: false,
  }).messageId;
  log.debug('placeholder message created', { messageId: currentMessageId });

  const writer = createStreamWriter(services, currentMessageId, { intervalMs: 80 });
  const toolActivity = createToolActivityWriter(services, currentMessageId, { intervalMs: 250 });

  // Upsert the thread's claude-session artifact.
  ensureSessionArtifact(services, threadId, {
    status: 'streaming',
    startedAt: Date.now(),
  });
  updateSessionArtifact(services, threadId, { status: 'streaming' });

  // Read the user's current permission-mode choice.
  const activePermissionMode = readSessionPermissionMode(services, threadId);
  const effectivePermissionMode = phase === 'plan' ? 'plan' : activePermissionMode;
  log.debug('active permission mode', { permissionMode: effectivePermissionMode });

  // Phase-aware system-prompt nudging (plan/edit/review).
  const phaseHint = phase ? PHASE_HINTS[phase] : undefined;
  const composedSystemPrompt = [phaseHint, systemPrompt].filter(Boolean).join('\n\n') || undefined;

  // Clear one-shot flags before the query — their purpose is consumed the
  // moment we read them. If the query throws, we don't want the next turn
  // to re-fork or re-revert.
  if (forkFrom || revertTo) {
    persistClaudeState(services, threadId, {
      ...(forkFrom && { forkFrom: undefined }),
      ...(revertTo && { revertTo: undefined }),
    });
  }

  // ─── Resolve images to base64 content blocks ────────────────────────
  // If the user pasted images, convert media:// URLs to Anthropic image
  // content blocks so the CLI sends them to the LLM.
  let prompt: any = text;
  if (references?.images?.length) {
    const content: any[] = [{ type: 'text', text }];
    for (const img of references.images) {
      const match = img.url.match(/^media:\/\/([^/]+)\/(.+)$/);
      if (!match) continue;
      const ref = { entityId: match[1], filename: match[2], alt: img.name || '', originalUrl: img.url };
      const media = (services.media as any).readMediaBuffer(ref);
      if (!media) continue;
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: media.mimeType,
          data: media.data.toString('base64'),
        },
      });
    }
    if (content.length > 1) {
      // Only use content array if we actually resolved images
      prompt = { type: 'user', message: { role: 'user', content }, parent_tool_use_id: null };
    }
  }

  // ─── Fire the query ─────────────────────────────────────────────────
  try {
    log.debug('invoking claudeCode.query', {
      model,
      resumeSessionId: resumeSessionId ?? null,
      permissionMode: effectivePermissionMode,
      allowedTools: allowedTools ?? DEFAULT_ALLOWED_TOOLS,
      hasSystemPrompt: !!composedSystemPrompt,
      fork: !!forkFrom,
      imageCount: references?.images?.length ?? 0,
    });
    const handle = await services.cli.claudeCode.query({
      prompt,
      resume: resumeSessionId,
      model,
      includePartialMessages: true,
      permissionMode: effectivePermissionMode,
      allowedTools: allowedTools ?? DEFAULT_ALLOWED_TOOLS,
      disallowedTools,
      systemPrompt: composedSystemPrompt,
      surfaceControlRequests: true,
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
      // against truly unexpected escapes.
      log.error('consumeStream escaped error boundary', { err: err?.message });
    });

    return { success: true, streaming: true };
  } catch (err: any) {
    const message = err?.message || 'Claude Code query failed to start';
    log.error('chat action failed to start query', { message, stack: err?.stack });
    toolActivity.finalise('error');
    updateSessionArtifact(services, threadId, { status: 'idle' });
    writer.finalize(`⚠️ ${message}`);
    setRunning(services, threadId, false);
    return { success: false, error: message, messageId: currentMessageId };
  }
}
