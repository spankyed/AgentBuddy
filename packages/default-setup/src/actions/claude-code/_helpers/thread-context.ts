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

export interface ClaudeCodeThreadState {
  sessionId?: string;
  lastTurnAt?: number;
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
