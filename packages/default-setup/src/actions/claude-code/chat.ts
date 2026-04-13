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
  };

  const log = services.logger;
  log.debug('chat action invoked', { threadId, mode: params.mode, phase, textLen: text?.length });

  if (!threadId || !text?.trim()) {
    return { success: false, error: 'threadId and text are required' };
  }

  // Resume any prior conversation parked on this thread.
  const prior = getClaudeState(services, threadId);
  const resumeSessionId = prior?.sessionId;
  log.debug('resume state resolved', { resumeSessionId: resumeSessionId ?? null });

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
    persistClaudeState(services, threadId, { pendingControlRequest: undefined });
  }

  // Mark this thread as having an active turn.
  setRunning(services, threadId, true);

  // Create the empty assistant message we'll stream into.
  const currentMessageId = services.chat.sendBlockMessage({
    threadId,
    text: '',
    blocks: [],
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

  // ─── Fire the query ─────────────────────────────────────────────────
  try {
    log.debug('invoking claudeCode.query', {
      model,
      resumeSessionId: resumeSessionId ?? null,
      permissionMode: effectivePermissionMode,
      allowedTools: allowedTools ?? DEFAULT_ALLOWED_TOOLS,
      hasSystemPrompt: !!composedSystemPrompt,
    });
    const handle = await services.cli.claudeCode.query({
      prompt: text,
      resume: resumeSessionId,
      model,
      includePartialMessages: true,
      permissionMode: effectivePermissionMode,
      allowedTools: allowedTools ?? DEFAULT_ALLOWED_TOOLS,
      disallowedTools,
      systemPrompt: composedSystemPrompt,
      surfaceControlRequests: true,
    } as any);

    // Store the handle so "CC: Route Response" and the stream consumer
    // can write control_responses back to the CLI's stdin.
    (services.cli as any).claudeCode.storeHandle(threadId, handle);

    log.debug('query handle received, kicking off stream consumer');

    // Fire-and-forget: the stream consumer runs in the background,
    // processing events until the CLI stream ends. The action returns
    // immediately so the brain's step actor is freed.
    consumeStream(handle, { services, threadId, text, phase }, {
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
