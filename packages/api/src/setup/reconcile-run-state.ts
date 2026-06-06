import { EARS } from '@/core/types';
import { findAll } from '@/core/shared/repository';
import { tx } from '@/core/ears/helpers/transaction';
import type { ThreadEntity } from '@/systems/threads/types';

/**
 * Clear stale run-state flags left over from a previous process.
 *
 * CLI/Codex handles live in process-memory only, so after a restart every
 * thread with `isRunning === true` is stale by definition. Without this:
 *   - The concurrency guard in chat.ts keeps queueing every new user message
 *     against the phantom "running" turn and the queue never drains.
 *   - The FE seeds chatStates from the thread entity, so the chat panel
 *     shows "working" indefinitely after a crash mid-turn.
 *
 * MUST run synchronously at boot, before actors start, so no events race the
 * writes. The flow-based reconciliation actions handle heavier cleanup
 * (artifacts, session markers) after the flow system is up.
 */
export function reconcileStaleRunState(): void {
  const threads = findAll<ThreadEntity>(EARS.Entity.Thread);
  let ccFixed = 0;
  let cdxFixed = 0;

  for (const thread of threads) {
    const context = (thread as any).context ?? {};
    const isPaused = (thread as any).chatState === 'paused';

    // ── Claude Code ───────────────────────────────────────────────────
    const cc = context.claudeCode;
    if (cc) {
      const needsRepair =
        cc.isRunning === true ||
        cc.autoAcceptEdits !== undefined ||
        cc.queuedMessage !== undefined ||
        (!isPaused && cc.pendingControlRequest !== undefined);

      if (needsRepair) {
        const nextCc = {
          ...cc,
          isRunning: false,
          autoAcceptEdits: undefined,
          queuedMessage: undefined,
          ...(!isPaused && { pendingControlRequest: undefined }),
        };
        tx(thread.id as any)
          .put('context', { ...context, claudeCode: nextCc })
          .put('updatedAt', Date.now())
          .id();
        ccFixed++;
      }
    }

    // ── Codex ─────────────────────────────────────────────────────────
    const cdx = context.codex;
    if (cdx) {
      const needsRepair =
        cdx.isRunning === true ||
        cdx.chatState === 'working' ||
        cdx.pendingApproval !== undefined ||
        cdx.queuedMessage !== undefined;

      if (needsRepair) {
        const nextCdx = {
          ...cdx,
          isRunning: false,
          chatState: 'idle',
          pendingApproval: undefined,
          queuedMessage: undefined,
        };
        tx(thread.id as any)
          .put('context', { ...(thread as any).context, codex: nextCdx })
          .put('updatedAt', Date.now())
          .id();
        cdxFixed++;
      }
    }

    // ── Thread-level chatState ────────────────────────────────────────
    if ((thread as any).chatState === 'working') {
      tx(thread.id as any).put('chatState', 'idle').put('updatedAt', Date.now()).id();
    }
  }

  if (ccFixed || cdxFixed) {
    console.log(`[reconcile] Cleared stale run-state (cc=${ccFixed}, cdx=${cdxFixed})`);
  }
}
