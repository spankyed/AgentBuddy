// The partition policy every store is opened with. It takes no arguments and nothing contributes to it, so
// what is left to check is the routing itself: which types are kept out of the database, and which
// partitions are hydrated at boot.
import { describe, expect, it } from 'vitest';
import { appPartitionPolicy } from '../../src/database/open.ts';
import { SDK_ENTITIES } from '@apack/sdk/types';
import { APPLIED_CONTENT_ENTITY } from '../../src/app-state/index.ts';

const policy = appPartitionPolicy();

describe('the app partition policy', () => {
  it('keeps the SDK\'s volatile types out of the database, and persists everything else', () => {
    expect(policy.routeEntity(`${SDK_ENTITIES.TNode}-1`)).toBe('volatileBackup');
    expect(policy.routeEntity('Note-1')).toBe('primary');
    expect(policy.routeEntity(`${SDK_ENTITIES.Flow}-1`)).toBe('primary');
    // What a restore rests on: without the applied content a backup brings back, every entity would read
    // as the user's own or as one they deleted
    expect(policy.routeEntity(`${APPLIED_CONTENT_ENTITY}-default-setup`)).toBe('primary');
  });

  it('follows a relation to the volatile partition when either end is volatile', () => {
    expect(policy.routeRelation({ srcType: 'Note', tgtType: SDK_ENTITIES.TNode })).toBe('volatileBackup');
    expect(policy.routeRelation({ srcType: SDK_ENTITIES.TNode, tgtType: 'Note' })).toBe('volatileBackup');
    expect(policy.routeRelation({ srcType: 'Note', tgtType: SDK_ENTITIES.Flow })).toBe('primary');
  });

  it('hydrates only the primary partition', () => {
    expect([...policy.hydrate]).toEqual(['primary']);
  });
});
