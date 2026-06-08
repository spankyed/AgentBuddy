import { describe, expect, it } from 'vitest';
import { applyTNodeSpawn, denormalizeTNodeTree, normalizeTNodeTree, type NormalizedTNodeTree } from './state';
import type { TNodeEntity, TrackEntity } from '@app/api';

function tNode(id: string, label = id): TNodeEntity {
  return {
    id,
    entityType: 'tnode',
    tNodeType: 'step',
    label,
    status: 'running',
  } as unknown as TNodeEntity;
}

describe('brain trace tree state', () => {
  it('dedupes duplicate ids when normalizing initial trace data', () => {
    const tree = [
      { ...tNode('event-1'), children: [tNode('step-1'), tNode('step-1')] },
      { ...tNode('event-1'), children: [tNode('step-1'), tNode('step-2')] },
    ] as TrackEntity[];

    const normalized = normalizeTNodeTree(tree);

    expect(normalized.rootIds).toEqual(['event-1']);
    expect(normalized.childrenById['event-1']).toEqual(['step-1', 'step-2']);
    expect(denormalizeTNodeTree(normalized)).toHaveLength(1);
  });

  it('upserts replayed spawn events without duplicating parent membership', () => {
    const initial: NormalizedTNodeTree = {
      byId: {
        'event-1': tNode('event-1'),
        'step-1': tNode('step-1', 'old'),
        'child-1': tNode('child-1'),
      },
      rootIds: ['event-1'],
      childrenById: {
        'event-1': ['step-1'],
        'step-1': ['child-1'],
        'child-1': [],
      },
    };

    const updated = applyTNodeSpawn(initial, tNode('step-1', 'new'), 'event-1', 'flow-1');

    expect(updated.childrenById['event-1']).toEqual(['step-1']);
    expect(updated.childrenById['step-1']).toEqual(['child-1']);
    expect(updated.byId['step-1'].label).toBe('new');
  });
});
