import { EARS } from '@/core/types';
import { findAll } from '@/core/shared/repository';
import { qx } from '@/core/ears/helpers/query';
import { tx } from '@/core/ears/helpers/transaction';
import { settingsQueries, settingsCommands } from '@/systems/settings/repository';
import type { ThreadEntity, ArtifactEntity } from '@/systems/threads/types';
import type { Migration } from './index';

export const migration: Migration = {
  target: '0.2.9',
  description: 'Hide manager mode; migrate session artifact data to thread context; strip artifact content',
  up: () => {
    // ── Hide manager mode from mode selector ──────────────────────────
    const data = settingsQueries.getSettings();
    const modes: Array<{ id: string; hidden?: boolean; [k: string]: any }> =
      (data.plugins as any)?.threads?.chat?.modes ?? [];

    const manager = modes.find(m => m.id === 'manager');
    if (manager && !manager.hidden) {
      manager.hidden = true;
      settingsCommands.updateSettings('plugin', 'threads', ['chat', 'modes'], modes);
    }

    // ── Migrate session artifact data to thread context ───────────────
    const threads = findAll<ThreadEntity>(EARS.Entity.Thread);
    let migrated = 0;

    for (const thread of threads) {
      const tags: string[] = (thread as any).tags ?? [];
      if (!tags.includes('claude-code')) continue;

      // Idempotent guard: skip if thread context already has session data.
      const existing = (thread as any).context?.claudeCode;
      if (existing?.turns !== undefined) continue;

      // Find claude-session artifact for this thread.
      const artifacts = qx().relatedTo(thread.id).ofType(EARS.Entity.Artifact)
        .pick(['artifactType', 'content'] as const) as Array<Pick<ArtifactEntity, 'artifactType' | 'content'>>;
      const session = artifacts.find(a => a.artifactType === 'claude-session');
      if (!session) continue;

      const content = session.content as Record<string, unknown> | null;
      if (!content) continue;

      // Merge artifact fields into thread context, preserving existing
      // ephemeral state (isRunning, pendingControlRequest, etc.).
      const prevContext = (thread as any).context ?? {};
      const prevCcState = prevContext.claudeCode ?? {};
      const nextCcState = {
        ...prevCcState,
        // Only copy fields that aren't already set on thread context.
        ...(prevCcState.sessionId === undefined && content.sessionId ? { sessionId: content.sessionId } : {}),
        ...(prevCcState.cwd === undefined && content.cwd ? { cwd: content.cwd } : {}),
        ...(prevCcState.lastTurnAt === undefined && content.lastTurnAt ? { lastTurnAt: content.lastTurnAt } : {}),
        // Session data fields (artifact-only before this migration).
        model: content.model ?? '',
        startedAt: content.startedAt ?? Date.now(),
        turns: content.turns ?? 0,
        totalCostUsd: content.totalCostUsd ?? 0,
        chatState: content.chatState ?? 'idle',
        toolCallCount: content.toolCallCount ?? 0,
        permissionMode: content.permissionMode ?? 'default',
        ...(content.useWorktree !== undefined ? { useWorktree: content.useWorktree } : {}),
        ...(content.sessionError !== undefined ? { sessionError: content.sessionError } : {}),
        ...(content.alertedThresholds !== undefined ? { alertedThresholds: content.alertedThresholds } : {}),
        ...(content.contextUsage !== undefined ? { contextUsage: content.contextUsage } : {}),
        ...(content.lastTool !== undefined ? { lastTool: content.lastTool } : {}),
        ...(content.recentTools !== undefined ? { recentTools: content.recentTools } : {}),
        ...(content.additionalDirs !== undefined ? { additionalDirs: content.additionalDirs } : {}),
      };

      tx(thread.id as any)
        .put('context', { ...prevContext, claudeCode: nextCcState })
        .put('updatedAt', Date.now())
        .id();

      migrated++;
    }

    if (migrated > 0) {
      console.log(`[migration] Migrated session artifact data to thread context for ${migrated} threads`);
    }

    // ── Strip claude-session artifact content (now a marker only) ─────
    const allThreads = findAll<ThreadEntity>(EARS.Entity.Thread);
    let stripped = 0;

    for (const thread of allThreads) {
      const tags: string[] = (thread as any).tags ?? [];
      if (!tags.includes('claude-code')) continue;

      const artifacts = qx().relatedTo(thread.id).ofType(EARS.Entity.Artifact)
        .pick(['id', 'artifactType', 'content'] as const) as Array<Pick<ArtifactEntity, 'id' | 'artifactType' | 'content'>>;
      const session = artifacts.find(a => a.artifactType === 'claude-session');
      if (!session) continue;

      // Idempotent: skip if content is already empty.
      const content = session.content as Record<string, unknown> | null;
      if (!content || Object.keys(content).length === 0) continue;

      tx(session.id as any).put('content', {}).id();
      stripped++;
    }

    if (stripped > 0) {
      console.log(`[migration] Stripped content from ${stripped} claude-session artifacts (now markers only)`);
    }
  },
};
