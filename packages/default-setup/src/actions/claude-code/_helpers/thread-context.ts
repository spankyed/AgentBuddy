/**
 * Thin helpers for reading/writing `thread.context.claudeCode` and
 * toggling the `claude-session` tag.
 *
 * The Thread entity now carries a free-form `context` field (see
 * `packages/api/src/systems/threads/types.ts` → `ThreadContext`). Claude
 * Code parks its per-thread session state under `context.claudeCode` so the
 * chat action can resume the right conversation on subsequent turns.
 */

import type { Services, EntityId } from '../../../types';
import { resolvePlanDraft } from './plan-artifact';

export interface QueuedMessage {
  text: string;
  mode?: string;
  phase?: string;
  /** User message entity ID — for clearing the 'queued' status indicator on drain. */
  messageId?: string;
  /** Attached references (images, files, context) — preserved so they survive queuing. */
  references?: any;
}

export interface PendingControlRequest {
  /** The CLI's request_id for the control_response. */
  requestId: string;
  /** The messageId of the approval/choice block sent to the user. */
  approvalMessageId: string;
  /** The tool name from the control_request. */
  toolName: string;
  /** The original input from the control_request, echoed back on allow responses. */
  originalInput?: Record<string, unknown>;
}

export interface ClaudeCodeThreadState {
  sessionId?: string;
  lastTurnAt?: number;
  /** True while a chat action invocation is actively running on this thread. */
  isRunning?: boolean;
  /** Message waiting to be processed after the current turn ends. */
  queuedMessage?: QueuedMessage;
  /**
   * Set when the CLI emits a `control_request` and we've sent an approval
   * block to the user. "CC: Route Response" reads this to match the user's
   * response back to the right CLI request_id. Cleared after the response
   * is routed.
   */
  pendingControlRequest?: PendingControlRequest;
  /**
   * Set when the chat action detects no CWD is configured and sends a
   * directory-picker block. Stores the original message params so the
   * query can be retried after the user picks a directory.
   */
  pendingDirectorySelect?: {
    pickerMessageId: string;
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
  /**
   * Set mid-turn when the user checks "Auto-accept file edits" on an
   * approval block. The stream-consumer reads this to auto-approve
   * remaining file mutation control_requests in the current turn.
   */
  autoAcceptEdits?: boolean;
  /**
   * One-shot flag set by CC: Handle Fork. When present, the next chat action
   * invocation passes `forkSession: true` to the CLI so it creates a new
   * session JSONL file instead of appending to the source session. Cleared
   * after the query starts.
   */
  forkFrom?: { sessionId: string; cliUuid?: string };
  /**
   * One-shot flag set by CC: Handle Revert. When present, the next chat
   * action passes `--resume-session-at <cliUuid> --fork-session` to the CLI
   * so it creates a new session truncated to the revert point. Cleared after
   * the query starts.
   */
  revertTo?: { cliUuid: string };
}

export const CLAUDE_SESSION_TAG = 'claude-session';

/** Read the Claude Code state stashed on a thread. Returns `undefined` if none. */
export function getClaudeState(services: Services, threadId: string): ClaudeCodeThreadState | undefined {
  const thread = services.repository.threadQueries.byId(threadId as any) as any;
  return thread?.context?.claudeCode as ClaudeCodeThreadState | undefined;
}

/**
 * Persist a sessionId onto a thread (merging with any existing `context`)
 * and add the `claude-session` tag if missing. Idempotent.
 */
export function persistClaudeState(
  services: Services,
  threadId: string,
  state: ClaudeCodeThreadState,
): void {
  const thread = services.repository.threadQueries.byId(threadId as any) as any;
  if (!thread) return;

  const nextContext = {
    ...(thread.context || {}),
    claudeCode: { ...(thread.context?.claudeCode || {}), ...state },
  };

  const existingTags: string[] = Array.isArray(thread.tags) ? thread.tags : [];
  const nextTags = existingTags.includes(CLAUDE_SESSION_TAG)
    ? existingTags
    : [...existingTags, CLAUDE_SESSION_TAG];

  const tagAdded = !existingTags.includes(CLAUDE_SESSION_TAG);

  services.repository.threadCommands.update(threadId as any, {
    context: nextContext,
    tags: nextTags,
  });

  // Notify frontend so tag filters update without a page refresh
  if (tagAdded) {
    services.emitter.sendToPlugin('threads', {
      type: 'THREAD_UPDATED',
      threadId,
      updates: { tags: nextTags },
    });
  }
}

// ─── Concurrency helpers ─────────────────────────────────────────────────────
// Used by chat.ts to serialize turns on the same thread. State is persisted to
// thread.context.claudeCode so it survives across compiled-action scopes.

/** Mark whether a chat action is currently running on this thread. */
export function setRunning(services: Services, threadId: string, running: boolean): void {
  persistClaudeState(services, threadId, { isRunning: running });
}

/** Clear the sessionId so the next turn starts a fresh CLI session. */
export function clearSessionId(services: Services, threadId: string): void {
  persistClaudeState(services, threadId, { sessionId: undefined });
}

/**
 * Queue a message for processing after the current turn ends. Last write
 * wins (burst debounce) — if a prior message was already queued on this
 * thread, mark its status as 'cancelled' so the user sees the "Queued"
 * indicator flip to "Cancelled — resend" instead of silently overwriting
 * and leaving a misleading amber pulse on a message that will never run.
 */
export function enqueueMessage(services: Services, threadId: string, msg: QueuedMessage): void {
  const prior = getClaudeState(services, threadId);
  const prevMessageId = prior?.queuedMessage?.messageId;
  if (prevMessageId && prevMessageId !== msg.messageId) {
    services.chat.updateMessageState(prevMessageId as any, { status: 'cancelled' } as any);
  }
  persistClaudeState(services, threadId, { queuedMessage: msg });
}

/** Pop the queued message (if any) and clear it from the thread context. */
export function dequeueMessage(services: Services, threadId: string): QueuedMessage | undefined {
  const prior = getClaudeState(services, threadId);
  const msg = prior?.queuedMessage;
  if (msg) {
    persistClaudeState(services, threadId, { queuedMessage: undefined });
  }
  return msg;
}

/**
 * Kill the CLI handle, invalidate any pending interactive block, resolve
 * plan drafts, and clear all mid-turn flags. Shared by pause-turn, deny-tool,
 * and the stale-turn cleanup in chat.ts.
 */
export function killTurn(services: Services, threadId: string): void {
  const prior = getClaudeState(services, threadId);

  // Kill CLI process.
  const handle = (services.cli as any).claudeCode.getHandle(threadId);
  if (handle) {
    try { handle.kill(); } catch { /* already gone */ }
    (services.cli as any).claudeCode.clearHandle(threadId);
  }

  // Reject plan draft if killed during ExitPlanMode approval.
  if (prior?.pendingControlRequest?.toolName === 'ExitPlanMode') {
    resolvePlanDraft(services, threadId as EntityId, 'rejected');
  }

  // Invalidate the stale interactive block so it's greyed out in the UI.
  if (prior?.pendingControlRequest) {
    services.chat.updateMessageState(prior.pendingControlRequest.approvalMessageId as any, {
      responseTimestamp: Date.now(),
      blockResponse: { cancelled: true },
    } as any);
  }

  // Invalidate queued message so the user knows to resend.
  const queued = dequeueMessage(services, threadId);
  if (queued?.messageId) {
    services.chat.updateMessageState(queued.messageId as any, { status: 'cancelled' } as any);
  }

  // Clear all mid-turn flags.
  persistClaudeState(services, threadId, {
    pendingControlRequest: undefined,
    pendingDirectorySelect: undefined,
    autoAcceptEdits: undefined,
    isRunning: false,
  });
}

/**
 * Clear Claude Code state from a thread and remove the `claude-session` tag.
 * Used by the reset action.
 */
export function clearClaudeState(services: Services, threadId: string): void {
  const thread = services.repository.threadQueries.byId(threadId as any) as any;
  if (!thread) return;

  const nextContext = { ...(thread.context || {}) };
  delete nextContext.claudeCode;

  const existingTags: string[] = Array.isArray(thread.tags) ? thread.tags : [];
  const nextTags = existingTags.filter((t) => t !== CLAUDE_SESSION_TAG);

  const tagRemoved = existingTags.includes(CLAUDE_SESSION_TAG);

  services.repository.threadCommands.update(threadId as any, {
    context: nextContext,
    tags: nextTags,
  });

  // Notify frontend so tag filters update without a page refresh
  if (tagRemoved) {
    services.emitter.sendToPlugin('threads', {
      type: 'THREAD_UPDATED',
      threadId,
      updates: { tags: nextTags },
    });
  }
}
