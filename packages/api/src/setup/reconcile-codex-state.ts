import { EARS } from '@/core/types';
import { findAll } from '@/core/shared/repository';
import { qx } from '@/core/ears/helpers/query';
import { tx } from '@/core/ears/helpers/transaction';
import type { ArtifactEntity, ThreadEntity } from '@/systems/threads/types';

/**
 * Clear stale Codex run-state left over from a previous process.
 *
 * Mirror of `reconcileStaleClaudeState` for the Codex context. The app-server
 * session lives in a child process — after a restart it has no knowledge of
 * previous threads, so any `context.codex.isRunning === true` is stale.
 * Without this, the concurrency guard in chat.ts re-enqueues every new message
 * and the queue never drains.
 */
export function reconcileStaleCodexState(): void {
  const threads = findAll<ThreadEntity>(EARS.Entity.Thread);
  let fixed = 0;

  for (const thread of threads) {
    const cdx = (thread.context as any)?.codex;
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
    tx(thread.id as any)
      .put('context', { ...(thread.context as any || {}), codex: nextCdx })
      .put('updatedAt', Date.now())
      .id();

    // Also reset thread-level chatState if stuck
    if ((thread as any).chatState === 'working') {
      tx(thread.id as any).put('chatState', 'idle').id();
    }

    fixed++;
  }

  if (fixed) {
    console.log(`[reconcile] Cleared stale Codex state (threads=${fixed})`);
  }
}

/**
 * Convert imported Codex session markers that were accidentally stored as
 * `claude-session` artifacts before Codex had a first-class artifact type.
 *
 * Runs idempotently at boot as a reconcile step because some local databases
 * may already be stamped at the current app version and would not see the
 * versioned migration again.
 */
export function backfillCodexSessionArtifacts(): number {
  const threads = findAll<ThreadEntity>(EARS.Entity.Thread);
  let converted = 0;

  for (const thread of threads) {
    const context = (thread as any).context ?? {};
    if (!context.codex) continue;

    const artifacts = qx().relatedTo(thread.id).ofType(EARS.Entity.Artifact)
      .pick(['id', 'artifactType', 'title', 'content'] as const) as Array<Pick<ArtifactEntity, 'id' | 'artifactType' | 'title' | 'content'>>;
    const hasCodexSession = artifacts.some(a => a.artifactType === 'codex-session');
    if (hasCodexSession) continue;

    const mislabeled = artifacts.find(a => {
      if (a.artifactType !== 'claude-session') return false;
      const content = a.content as any;
      return a.title === 'Codex session' || content?.provider === 'codex' || !context.claudeCode;
    });
    if (!mislabeled?.id) continue;

    tx(mislabeled.id as any)
      .put('artifactType', 'codex-session')
      .put('title', 'Codex session')
      .put('content', {})
      .put('updatedAt', Date.now())
      .id();
    converted++;
  }

  if (converted > 0) {
    console.log(`[reconcile] Converted ${converted} Codex session artifact marker(s)`);
  }

  return converted;
}
