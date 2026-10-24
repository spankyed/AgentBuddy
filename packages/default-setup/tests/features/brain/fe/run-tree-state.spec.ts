import { describe, expect, it } from 'vitest';
import { applyRunNodeSpawn, denormalizeRunNodeTree, normalizeRunNodeTree, type NormalizedRunNodeTree } from '#features/brain/fe/run-tree.ts';
import type { RunNode, RunTree } from '@apackdev/sdk/steps';

function runNode(id: string, label = id): RunNode {
  return {
    id,
    entityType: 'run-node',
    kind: 'step',
    label,
    status: 'running',
  } as unknown as RunNode;
}

describe('brain run tree state', () => {
  it('dedupes duplicate ids when normalizing initial run data', () => {
    const tree = [
      { ...runNode('event-1'), children: [runNode('step-1'), runNode('step-1')] },
      { ...runNode('event-1'), children: [runNode('step-1'), runNode('step-2')] },
    ] as RunTree[];

    const normalized = normalizeRunNodeTree(tree);

    expect(normalized.rootIds).toEqual(['event-1']);
    expect(normalized.childrenById['event-1']).toEqual(['step-1', 'step-2']);
    expect(denormalizeRunNodeTree(normalized)).toHaveLength(1);
  });

  it('upserts replayed spawn events without duplicating parent membership', () => {
    const initial: NormalizedRunNodeTree = {
      byId: {
        'event-1': runNode('event-1'),
        'step-1': runNode('step-1', 'old'),
        'child-1': runNode('child-1'),
      },
      rootIds: ['event-1'],
      childrenById: {
        'event-1': ['step-1'],
        'step-1': ['child-1'],
        'child-1': [],
      },
    };

    const updated = applyRunNodeSpawn(initial, runNode('step-1', 'new'), 'event-1', 'flow-1');

    expect(updated.childrenById['event-1']).toEqual(['step-1']);
    expect(updated.childrenById['step-1']).toEqual(['child-1']);
    expect(updated.byId['step-1'].label).toBe('new');
  });
});
