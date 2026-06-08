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
        mode: 'skipped',
        eventType: 'user.message',
        label: 'Claude Code',
        trackKey: 'Claude Code:track:1',
        retainedNodeId: 'Node-a',
        skippedNodeIds: ['Node-b'],
      }),
    ]);
  });

  it('preserves legacy same-label listeners without trackKey and reports suspicion', () => {
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
    expect(deduped.warnings).toEqual([
      expect.objectContaining({
        mode: 'suspicious',
        label: 'Claude Code',
        retainedNodeId: 'Node-a',
        skippedNodeIds: ['Node-b'],
      }),
    ]);
  });
});
