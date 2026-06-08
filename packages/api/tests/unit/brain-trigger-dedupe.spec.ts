import { describe, expect, it } from 'vitest';
import { dedupeMatchingTriggerNodes, type FlowTriggerNode } from '@/systems/brain/trigger-dedupe';
import { EARS } from '@/core/types';

describe('brain trigger dedupe', () => {
  it('skips duplicate compiled trigger tracks with the same trackKey', () => {
    const nodes: FlowTriggerNode[] = [
      { id: 'Node-a' as EARS.EntityId, triggerType: 'listener', eventType: 'user.message', label: 'Claude Code', trackKey: 'Claude Code:track:1' },
      { id: 'Node-b' as EARS.EntityId, triggerType: 'listener', eventType: 'user.message', label: 'Claude Code', trackKey: 'Claude Code:track:1' },
      { id: 'Node-c' as EARS.EntityId, triggerType: 'listener', eventType: 'user.message', label: 'Codex', trackKey: 'Codex:track:1' },
    ];

    const deduped = dedupeMatchingTriggerNodes(nodes, {
      flowId: 'Flow-root' as EARS.EntityId,
      flowTNodeId: 'TNode-root' as EARS.EntityId,
      eventType: 'user.message',
    });

    expect(deduped.nodes.map(node => node.id)).toEqual(['Node-a', 'Node-c']);
    expect(deduped.warnings).toEqual([
      expect.objectContaining({
        kind: 'duplicate-track-key',
        eventType: 'user.message',
        label: 'Claude Code',
        trackKey: 'Claude Code:track:1',
        retainedNodeId: 'Node-a',
        duplicateNodeIds: ['Node-b'],
      }),
    ]);
  });

  it('preserves nodes without trackKey without warning', () => {
    const nodes: FlowTriggerNode[] = [
      { id: 'Node-a' as EARS.EntityId, triggerType: 'listener', eventType: 'user.message', label: 'Claude Code' },
      { id: 'Node-b' as EARS.EntityId, triggerType: 'listener', eventType: 'user.message', label: 'Claude Code' },
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
