import { describe, expect, it } from 'vitest';
import { dedupeMatchingTriggerNodes, type FlowTriggerNode } from '@/systems/brain/trigger-dedupe';
import { EARS } from '@/core/types';

describe('brain trigger dedupe', () => {
  it('skips duplicate logical listener tracks with the same event and label', () => {
    const nodes: FlowTriggerNode[] = [
      { id: 'Node-a' as EARS.EntityId, triggerType: 'listener', eventType: 'user.message', label: 'Claude Code' },
      { id: 'Node-b' as EARS.EntityId, triggerType: 'listener', eventType: 'user.message', label: 'Claude Code' },
      { id: 'Node-c' as EARS.EntityId, triggerType: 'listener', eventType: 'user.message', label: 'Codex' },
    ];

    const deduped = dedupeMatchingTriggerNodes(nodes, {
      flowId: 'Flow-root' as EARS.EntityId,
      flowTNodeId: 'TNode-root' as EARS.EntityId,
      eventType: 'user.message',
    });

    expect(deduped.nodes.map(node => node.id)).toEqual(['Node-a', 'Node-c']);
    expect(deduped.warnings).toEqual([
      expect.objectContaining({
        eventType: 'user.message',
        label: 'Claude Code',
        retainedNodeId: 'Node-a',
        skippedNodeIds: ['Node-b'],
      }),
    ]);
  });

  it('preserves distinct listener labels for the same event', () => {
    const nodes: FlowTriggerNode[] = [
      { id: 'Node-a' as EARS.EntityId, triggerType: 'listener', eventType: 'user.message', label: 'Claude Code' },
      { id: 'Node-b' as EARS.EntityId, triggerType: 'listener', eventType: 'user.message', label: 'Codex' },
    ];

    const deduped = dedupeMatchingTriggerNodes(nodes, {
      flowId: 'Flow-root' as EARS.EntityId,
      flowTNodeId: 'TNode-root' as EARS.EntityId,
      eventType: 'user.message',
    });

    expect(deduped.nodes.map(node => node.id)).toEqual(['Node-a', 'Node-b']);
    expect(deduped.warnings).toEqual([]);
  });
});
