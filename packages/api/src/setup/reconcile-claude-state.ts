import { EARS } from '@/core/types';
import { findAll } from '@/core/shared/repository';
import { tx } from '@/core/ears/helpers/transaction';
import type { ThreadEntity, ArtifactEntity } from '@/systems/threads/types';

/**
 * Clear stale Claude Code run-state left over from a previous process.
 *
 * CLI query handles live in a module-level Map (`services/claude-code/
 * handle-store.ts`) — i.e. process-memory only — so after the BE restarts,
 * every thread whose `context.claudeCode.isRunning === true` is stale by
 * definition: the CLI child that set the flag is gone.
 *
 * Without this reconcile step:
 *   - chat.ts:119 keeps queueing every new user message against the
 *     phantom "running" turn and the queue never drains.
 *   - The FE seeds `chatStates[threadId]` from the thread entity
 *     (see renderer state.ts), so the chat panel shows "working"
 *     indefinitely after a crash mid-turn.
 *
 * Runs once at boot, before actors start (so no events race the writes).
 * Safe to call with no live threads — both queries return empty and the
 * function is a no-op.
 */
export function reconcileStaleClaudeState(): void {
  let threadsFixed = 0;
  let artifactsFixed = 0;

  // ─── Threads: clear transient mid-turn flags + stale chatState ──────
  const threads = findAll<ThreadEntity>(EARS.Entity.Thread);
  for (const thread of threads) {
    const cc = (thread.context as any)?.claudeCode;
    const isPaused = (thread as any).chatState === 'paused';

    // Always clear process-scoped flags; keep pendingControlRequest for
    // paused threads so the user can still approve after restart.
    const needsContextRepair = cc && (
      cc.isRunning === true ||
      cc.autoAcceptEdits !== undefined ||
      (!isPaused && cc.pendingControlRequest !== undefined)
    );
    // Only 'working' is stale — 'paused' threads have a pending approval
    // the user can still act on.
    const staleChatState = (thread as any).chatState === 'working';

    if (!needsContextRepair && !staleChatState) continue;

    const threadTx = tx(thread.id as any).put('updatedAt', Date.now());
    if (needsContextRepair) {
      const nextCc = {
        ...cc,
        isRunning: false,
        autoAcceptEdits: undefined,
        // Preserve pendingControlRequest for paused threads.
        ...(!isPaused && { pendingControlRequest: undefined }),
      };
      threadTx.put('context', { ...(thread.context as any || {}), claudeCode: nextCc });
    }
    if (staleChatState) {
      threadTx.put('chatState', 'idle');
    }
    threadTx.id();
    threadsFixed++;
  }

  // ─── Session artifact: idle-ify any non-idle chatState ──────────────
  const artifacts = findAll<ArtifactEntity>(EARS.Entity.Artifact);
  for (const a of artifacts) {
    if (a.artifactType !== 'claude-session') continue;
    const content = a.content as any;
    if (!content || content.chatState !== 'working') continue;
    tx(a.id as any).put('content', { ...content, chatState: 'idle' }).put('updatedAt', Date.now()).id();
    artifactsFixed++;
  }

  if (threadsFixed || artifactsFixed) {
    console.log(`[reconcile] Cleared stale Claude Code state (threads=${threadsFixed}, artifacts=${artifactsFixed})`);
  }
}
