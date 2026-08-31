/**
 * CDX: Reconcile State — clears stale codex run-state left over from a previous process.
 *
 * The app-server session lives in a child process — after a restart it has no
 * knowledge of previous threads, so any `context.codex.isRunning === true` is
 * stale. Without this, the concurrency guard in chat.ts re-enqueues every new
 * message and the queue never drains.
 *
 * Runs on flow entry before CDX: Start Server.
 */

import type { ActionMeta, Services } from '../../types';

export const meta: ActionMeta = {
  label: 'CDX: Reconcile State',
  description: 'Clears stale Codex run-state left over from a previous process.',
  category: 'codex',
  input: {},
};

export async function action(_params: Record<string, any>, services: Services) {
  const threads = (services.repository.threadQueries as any).allUnfiltered() as any[];
  let fixed = 0;

  for (const thread of threads) {
    const cdx = thread.context?.codex;
    if (!cdx) continue;

    const needsRepair =
      cdx.isRunning === true ||
      cdx.chatState === 'working' ||
      cdx.pendingApproval !== undefined ||
      cdx.queuedMessage !== undefined;

    if (!needsRepair) continue;

    const nextCdx = {
      ...cdx,
      isRunning: false,
      chatState: 'idle',
      pendingApproval: undefined,
      queuedMessage: undefined,
    };

    const updates: Record<string, any> = {
      context: { ...(thread.context || {}), codex: nextCdx },
    };

    if (thread.chatState === 'working') {
      updates.chatState = 'idle';
    }

    services.repository.threadCommands.update(thread.id, updates);
    fixed++;
  }

  if (fixed) {
    services.logger.info(`[codex] Reconciled stale state (threads=${fixed})`);
  }

  return { success: true, fixed };
}
