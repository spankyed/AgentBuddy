/**
 * Threads Service
 *
 * Provides primitives for updating thread-level state with automatic
 * frontend notification, following the same pattern as artifact service.
 *
 * Also provides a generic cleanup hook registry so services can register
 * callbacks that run before destructive thread operations (e.g. message
 * soft-deletion on revert). This lets the threads system stop active
 * processes without knowing about specific services like Claude Code.
 */

import { EARS } from '@/core/types';
import { sendToPlugin } from './event-emitter';
import { repository } from '@/repository';
import { createLogger } from '@/core/shared/debug/logger';

const logger = createLogger('threads-service');

// ─── Cleanup hook registry ──────────────────────────────────────────────────

const cleanupCallbacks = new Map<string, (threadId: string) => void>();

/**
 * Register a named cleanup callback invoked before message soft-deletion.
 * Returns an unsubscribe function.
 */
export function registerCleanup(id: string, fn: (threadId: string) => void): () => void {
  cleanupCallbacks.set(id, fn);
  return () => { cleanupCallbacks.delete(id); };
}

/**
 * Run all registered cleanup callbacks for a thread. Synchronous — each
 * callback is expected to be synchronous (LMDB ops, handle kills, etc.).
 * Errors are caught and logged so one failing callback doesn't block others.
 */
export function runCleanup(threadId: string): void {
  for (const [id, fn] of cleanupCallbacks.entries()) {
    try {
      fn(threadId);
    } catch (err: any) {
      logger.warn('cleanup callback failed', { id, threadId, error: err?.message });
    }
  }
}

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

  sendToPlugin('threads', {
    type: 'SET_CHAT_STATE',
    threadId: threadId as string,
    chatState,
  });
}
