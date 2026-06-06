import { EARS } from '@/core/types';
import { findAll } from '@/core/shared/repository';
import { tx } from '@/core/ears/helpers/transaction';
import type { ThreadEntity } from '@/systems/threads/types';

/**
 * Clear stale thread-level chatState left over from a previous process.
 *
 * `chatState` is a first-class generic field on ThreadEntity that the core app
 * owns. After a restart, any thread stuck in 'working' is stale by definition
 * (the process that was servicing it is gone). Without this reset the
 * concurrency guard in chat.ts keeps queueing every new user message.
 *
 * Provider-specific cleanup (context.claudeCode, context.codex, artifacts, etc.)
 * is handled by flow entry actions after the flow system is up.
 *
 * MUST run synchronously at boot, before actors start, so no events race the writes.
 */
export function reconcileStaleRunState(): void {
  const threads = findAll<ThreadEntity>(EARS.Entity.Thread);
  let fixed = 0;
  for (const thread of threads) {
    if ((thread as any).chatState === 'working') {
      tx(thread.id as any).put('chatState', 'idle').put('updatedAt', Date.now()).id();
      fixed++;
    }
  }
  if (fixed) {
    console.log(`[reconcile] Cleared stale chatState on ${fixed} thread(s)`);
  }
}
