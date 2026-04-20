/**
 * Threads Service
 *
 * Provides primitives for updating thread-level state with automatic
 * frontend notification, following the same pattern as artifact service.
 */

import { EARS } from '@/core/types';
import { sendToPlugin } from './event-emitter';
import { repository } from '@/repository';

/**
 * Update a thread's chatState and notify the frontend.
 *
 * This is the canonical service-level write for chatState. The DSL helper
 * `updateChatState()` in session-artifact.ts handles the artifact side,
 * then delegates here for the thread write + emit.
 */
export function updateChatState(
  threadId: EARS.EntityId,
  chatState: string,
): void {
  try {
    repository.threadCommands.update(threadId, { chatState });
  } catch { /* thread may have been deleted */ }

  sendToPlugin('threads', {
    type: 'SET_CHAT_STATE',
    threadId: threadId as string,
    chatState,
  });
}
