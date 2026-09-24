// The partition policy the app's LMDB store is opened with: one object, following the packs registered at each call
import { describe, expect, it } from 'vitest';
import { setup } from 'xstate';
import { createPackRegistry } from '../../src/packs/registry.ts';

const { registerPack, partitionPolicy: registeredPartitionPolicy, unregisterPack } = createPackRegistry();

const machine = setup({}).createMachine({});
const Memo = 'PolicyMemo';

describe("a registry's partitionPolicy", () => {
  it('follows packs registering and unregistering, with no manual invalidation', () => {
    // Cached before the change
    expect(registeredPartitionPolicy.routeEntity(`${Memo}-1`)).toBe('primary');
    expect(registeredPartitionPolicy.routeEntity('TNode-1')).toBe('volatileBackup');

    registerPack({
      id: 'policy-pack',
      features: { feature: { system: { machine, receives: [] } } },
      ears: { entities: { Memo }, relKinds: {}, partitionPolicy: { excludedEntityTypes: [Memo] } },
    });
    expect(registeredPartitionPolicy.routeEntity(`${Memo}-1`)).toBe('volatileBackup');
    expect(registeredPartitionPolicy.routeRelation({ srcType: 'Note', tgtType: Memo })).toBe('volatileBackup');

    unregisterPack('policy-pack');
    expect(registeredPartitionPolicy.routeEntity(`${Memo}-1`)).toBe('primary');
    expect(registeredPartitionPolicy.routeRelation({ srcType: 'Note', tgtType: Memo })).toBe('primary');
  });

  it('hydrates only the primary partition', () => {
    expect([...registeredPartitionPolicy.hydrate]).toEqual(['primary']);
  });
});
