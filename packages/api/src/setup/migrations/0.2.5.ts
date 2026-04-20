import { EARS } from '@/core/types';
import { findAll } from '@/core/helpers/repository';
import { qx } from '@/core/ears/helpers/query';
import { tx } from '@/core/ears/helpers/transaction';
import type { ThreadEntity, ArtifactEntity } from '@/systems/threads/types';
import type { Migration } from './index';

export const migration: Migration = {
  target: '0.2.5',
  description: 'Backfill chatState from session artifacts onto thread entities',
  up: () => {
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
  },
};
