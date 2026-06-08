import { EARS } from '@/core/types';
import { findAll } from '@/core/shared/repository';
import { qx } from '@/core/ears/helpers/query';
import { tx } from '@/core/ears/helpers/transaction';
import type { ArtifactEntity, ThreadEntity } from '@/systems/threads/types';
import type { Migration } from './index';

/**
 * Convert imported Codex session markers that were accidentally stored as
 * `claude-session` artifacts before Codex had a first-class artifact type.
 */
export const migration: Migration = {
  target: '0.3.1',
  description: 'Backfill Codex session artifact markers',
  up: () => {
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
      console.log(`[migration:0.3.1] Converted ${converted} Codex session artifact marker(s)`);
    }
  },
};
