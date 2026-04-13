/**
 * Thin helpers for reading/writing `thread.context.claudeCode` and
 * toggling the `claude-session` tag.
 *
 * The Thread entity now carries a free-form `context` field (see
 * `packages/api/src/systems/threads/types.ts` → `ThreadContext`). Claude
 * Code parks its per-thread session state under `context.claudeCode` so the
 * chat action can resume the right conversation on subsequent turns.
 */

import type { Services } from '../../../types';

export interface QueuedMessage {
  text: string;
  mode?: string;
  phase?: string;
  /** User message entity ID — for clearing the 'queued' status indicator on drain. */
  messageId?: string;
}

export interface ClaudeCodeThreadState {
  sessionId?: string;
  lastTurnAt?: number;
  /** True while a chat action invocation is actively running on this thread. */
  isRunning?: boolean;
  /** messageId of the current approval/choice block awaiting user response. */
  pendingInteractionId?: string;
  /** Message waiting to be processed after the current turn ends. */
  queuedMessage?: QueuedMessage;
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

  services.repository.threadCommands.update(threadId as any, {
    context: nextContext,
    tags: nextTags,
  });
}

// ─── Concurrency helpers ─────────────────────────────────────────────────────
// Used by chat.ts to serialize turns on the same thread. State is persisted to
// thread.context.claudeCode so it survives across compiled-action scopes.

/** Mark whether a chat action is currently running on this thread. */
export function setRunning(services: Services, threadId: string, running: boolean): void {
  persistClaudeState(services, threadId, {
    isRunning: running,
    // Clear stale interaction/queue state when marking not-running.
    ...(!running && { pendingInteractionId: undefined }),
  });
}

/** Store the messageId of the block we're waiting on, so a concurrent invocation can cancel it. */
export function setPendingInteraction(services: Services, threadId: string, messageId: string | undefined): void {
  persistClaudeState(services, threadId, { pendingInteractionId: messageId });
}

/** Queue a message for processing after the current turn ends. Last write wins (burst debounce). */
export function enqueueMessage(services: Services, threadId: string, msg: QueuedMessage): void {
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

  services.repository.threadCommands.update(threadId as any, {
    context: nextContext,
    tags: nextTags,
  });
}
