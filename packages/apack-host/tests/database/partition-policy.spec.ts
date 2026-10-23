// The partition policy every store is opened with. It takes no arguments and nothing contributes to it, so
// what is left to check is the routing itself: every type and relation is persisted, and the primary
// partition is hydrated at boot.
import { describe, expect, it } from 'vitest';
import { appPartitionPolicy } from '../../src/database/open.ts';
import { SDK_ENTITIES } from '@apackdev/sdk/types';
import { APPLIED_CONTENT_ENTITY } from '../../src/app-state/index.ts';

const policy = appPartitionPolicy();

describe('the app partition policy', () => {
  it('persists every entity type', () => {
    expect(policy.routeEntity('Note')).toBe('primary');
    expect(policy.routeEntity(SDK_ENTITIES.Flow)).toBe('primary');
    // What a restore rests on: without the applied content a backup brings back, every entity would read
    // as the user's own or as one they deleted
    expect(policy.routeEntity(APPLIED_CONTENT_ENTITY)).toBe('primary');
  });

  it('persists every relation', () => {
    expect(policy.routeRelation({ srcType: 'Note', tgtType: SDK_ENTITIES.Flow })).toBe('primary');
  });

  it('hydrates only the primary partition', () => {
    expect([...policy.hydrate]).toEqual(['primary']);
  });
});
