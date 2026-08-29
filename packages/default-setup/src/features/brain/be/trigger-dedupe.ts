import type { ListenerNode } from '@/core/shared-types/flows';
import { EARS } from '@/core/types';

export type FlowTriggerNode = Pick<ListenerNode, 'id' | 'label' | 'eventType'> & {
  triggerType: 'listener' | 'schedule';
  scope?: ListenerNode['scope'];
  cronExpression?: string;
  trackKey?: string;
};

export interface TriggerDedupeWarning {
  kind: 'duplicate-track-key';
  flowId: EARS.EntityId;
  flowTNodeId: EARS.EntityId;
  eventType: string;
  label?: string;
  triggerType: 'listener' | 'schedule';
  trackKey?: string;
  retainedNodeId?: EARS.EntityId;
  duplicateNodeIds: EARS.EntityId[];
}

export function dedupeMatchingTriggerNodes(
  nodes: FlowTriggerNode[],
  details: { flowId: EARS.EntityId; flowTNodeId: EARS.EntityId; eventType: string },
): { nodes: FlowTriggerNode[]; warnings: TriggerDedupeWarning[] } {
  return dedupeTriggerNodes(nodes, details);
}

export function dedupeTriggerNodes(
  nodes: FlowTriggerNode[],
  details: { flowId: EARS.EntityId; flowTNodeId: EARS.EntityId; eventType?: string },
): { nodes: FlowTriggerNode[]; warnings: TriggerDedupeWarning[] } {
  const byTrackKey = new Map<string, FlowTriggerNode>();
  const skippedByTrackKey = new Map<string, FlowTriggerNode[]>();
  const retainedNodes: FlowTriggerNode[] = [];

  for (const node of nodes) {
    if (!node.trackKey) {
      retainedNodes.push(node);
      continue;
    }

    const existing = byTrackKey.get(node.trackKey);
    if (!existing) {
      byTrackKey.set(node.trackKey, node);
      retainedNodes.push(node);
      continue;
    }

    const skipped = skippedByTrackKey.get(node.trackKey) ?? [];
    skipped.push(node);
    skippedByTrackKey.set(node.trackKey, skipped);
  }

  const warnings: TriggerDedupeWarning[] = Array.from(skippedByTrackKey.entries()).map(([trackKey, skipped]) => {
    const retained = byTrackKey.get(trackKey)!;
    return {
      kind: 'duplicate-track-key',
      flowId: details.flowId,
      flowTNodeId: details.flowTNodeId,
      eventType: details.eventType ?? retained.eventType,
      label: retained.label,
      triggerType: retained.triggerType,
      trackKey,
      retainedNodeId: retained.id,
      duplicateNodeIds: skipped.map(node => node.id).filter(Boolean) as EARS.EntityId[],
    };
  });

  return {
    nodes: retainedNodes,
    warnings,
  };
}
