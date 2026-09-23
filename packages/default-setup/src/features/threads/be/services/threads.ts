/**
 * Threads Service
 *
 * Provides primitives for updating thread-level state with automatic
 * frontend notification, following the same pattern as artifact service.
 */

import { broadcastToPlugin } from '@/__generated__/events';
import { EARS } from '@/__generated__/ears';

import { repository } from '@/__generated__/repository';

/**
 * Update a thread's chatState and notify the frontend.
 *
 * This is the canonical service-level write for chatState. The DSL helper
 * `updateChatState()` in thread-context.ts handles the thread context side,
 * then delegates here for the thread write + emit.
 */
export function updateChatState(
  threadId: EARS.EntityId,
  chatState: string,
): void {
  try {
    repository.threadCommands.update(threadId, { chatState });
  } catch { /* thread may have been deleted */ }

  broadcastToPlugin('threads', {
    type: 'SET_CHAT_STATE',
    threadId: threadId as string,
    chatState,
  });
}

/** `services.threads`: thread-level state writes with frontend notification */
export const threadsService = {
  updateChatState,
};
