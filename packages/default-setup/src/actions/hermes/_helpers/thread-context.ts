/**
 * Helpers for reading/writing `thread.context.hermes` state.
 *
 * Mirrors the Claude Code `_helpers/thread-context.ts` pattern. The Thread
 * entity carries a free-form `context` field; Hermes parks its per-thread
 * session state under `context.hermes`.
 */

import type { Services } from '../../../types';

// ─── Types ───────────────────────────────────────────────────────────────────

export type ChatState = 'idle' | 'working' | 'paused' | 'error' | 'success';

export interface HermesThreadState {
  sessionId?: string;
  model?: string;
  workspace?: string;
  startedAt?: number;
  turns?: number;
  chatState?: ChatState;
  isRunning?: boolean;
  activeStreamId?: string;
  totalCostUsd?: number;
}

export const HERMES_TAG = 'hermes';

// ─── Core read/write ─────────────────────────────────────────────────────────

export function getHermesState(services: Services, threadId: string): HermesThreadState | undefined {
  const thread = services.repository.threadQueries.byId(threadId as any) as any;
  return thread?.context?.hermes as HermesThreadState | undefined;
}

export function persistHermesState(
  services: Services,
  threadId: string,
  state: Partial<HermesThreadState>,
): void {
  const thread = services.repository.threadQueries.byId(threadId as any) as any;
  if (!thread) return;

  const existing = (thread.context?.hermes || {}) as HermesThreadState;

  const nextContext = {
    ...(thread.context || {}),
    hermes: { ...existing, ...state },
  };

  const existingTags: string[] = Array.isArray(thread.tags) ? thread.tags : [];
  const nextTags = existingTags.includes(HERMES_TAG)
    ? existingTags
    : [...existingTags, HERMES_TAG];

  const tagAdded = !existingTags.includes(HERMES_TAG);

  services.repository.threadCommands.update(threadId as any, {
    context: nextContext,
    tags: nextTags,
  });

  services.emitter.sendToPlugin('threads', {
    type: 'THREAD_UPDATED',
    threadId,
    updates: {
      ...(tagAdded ? { tags: nextTags } : {}),
      context: nextContext,
    },
  });
}

export function setRunning(services: Services, threadId: string, running: boolean) {
  persistHermesState(services, threadId, { isRunning: running });
}

export function updateChatState(services: Services, threadId: string, chatState: ChatState) {
  persistHermesState(services, threadId, { chatState });
}
