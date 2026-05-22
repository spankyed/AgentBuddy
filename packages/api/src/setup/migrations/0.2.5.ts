import { EARS } from '@/core/types';
import { findAll } from '@/core/shared/repository';
import { qx } from '@/core/ears/helpers/query';
import { tx } from '@/core/ears/helpers/transaction';
import { settingsQueries, settingsCommands } from '@/systems/settings/repository';
import type { ThreadEntity, ArtifactEntity } from '@/systems/threads/types';
import type { Migration } from './index';

export const migration: Migration = {
  target: '0.2.5',
  description: 'Backfill chatState from session artifacts; backfill sourceHash on DSL entities; rename claude-session tag to claude-code',
  up: () => {
    // ── 1. Backfill chatState from session artifacts onto thread entities ──
    const threads = findAll<ThreadEntity>(EARS.Entity.Thread);
    for (const thread of threads) {
      // Skip if thread already has chatState set
      if ((thread as any).chatState) continue;

      // Find claude-session artifact for this thread
      const artifacts = qx().relatedTo(thread.id).ofType(EARS.Entity.Artifact)
        .pick(['artifactType', 'content'] as const) as Array<Pick<ArtifactEntity, 'artifactType' | 'content'>>;
      const session = artifacts.find(a => a.artifactType === 'claude-session');
      const chatState = (session?.content as any)?.chatState;

      if (typeof chatState === 'string') {
        tx(thread.id as any).put('chatState', chatState).put('updatedAt', Date.now()).id();
      }
    }

    // ── 2. Backfill sourceHash on DSL-sourced entities ────────────────────
    // In 0.2.4 the seed system started using sourceHash to distinguish
    // DSL-sourced items from user-created ones. Items without sourceHash are
    // treated as "untracked" (user-created) and skipped forever. Stamping a
    // placeholder value forces the next boot seed to update them and set the
    // real hash.
    const dslEntityTypes = [
      EARS.Entity.Document,
      EARS.Entity.Collection,
      EARS.Entity.Action,
      EARS.Entity.Prompt,
      EARS.Entity.Flow,
    ];

    for (const entityType of dslEntityTypes) {
      const entities = findAll<{ id: EARS.EntityId; sourceHash?: string }>(entityType);
      let count = 0;
      for (const entity of entities) {
        if (!entity.sourceHash) {
          tx(entity.id as any).put('sourceHash', 'migrated').put('updatedAt', Date.now()).id();
          count++;
        }
      }
      if (count > 0) {
        console.log(`[migration] Backfilled sourceHash on ${count} ${entityType} entities`);
      }
    }

    // Clear seedHash so runBootSeed() doesn't short-circuit — forces a full
    // re-seed that replaces the "migrated" placeholder with real hashes.
    settingsCommands.updateSettings('internal', null, ['seedHash'], null);

    // ── 3. Rename claude-session tag → claude-code on threads ──────────
    for (const thread of threads) {
      const tags: string[] = (thread as any).tags;
      if (!Array.isArray(tags) || !tags.includes('claude-session')) continue;
      const nextTags = tags.map((t: string) => t === 'claude-session' ? 'claude-code' : t);
      tx(thread.id as any).put('tags', nextTags).put('updatedAt', Date.now()).id();
    }

    // ── 4. Rename claude-session tag → claude-code in settings ─────────
    const data = settingsQueries.getSettings();
    const settingsTags: Array<{ name: string; color?: string }> = data.plugins?.threads?.tags ?? [];
    const idx = settingsTags.findIndex((t: any) => t.name === 'claude-session');
    if (idx !== -1) {
      settingsTags[idx] = { ...settingsTags[idx], name: 'claude-code' };
      settingsCommands.updateSettings('plugin', 'threads', ['tags'], settingsTags);
    }
  },
};
