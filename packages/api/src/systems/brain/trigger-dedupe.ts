import type { ListenerNode } from '@/core/shared-types/flows';
import { EARS } from '@/core/types';

export type FlowTriggerNode = Pick<ListenerNode, 'id' | 'label' | 'eventType'> & {
  triggerType: 'listener' | 'schedule';
  scope?: ListenerNode['scope'];
  cronExpression?: string;
  trackKey?: string;
};

export interface TriggerDedupeWarning {
  mode: 'skipped' | 'suspicious';
  flowId: EARS.EntityId;
  flowTNodeId: EARS.EntityId;
  eventType: string;
  label?: string;
  triggerType: 'listener' | 'schedule';
  trackKey?: string;
  retainedNodeId?: EARS.EntityId;
  skippedNodeIds: EARS.EntityId[];
}

function legacySuspicionKey(node: FlowTriggerNode): string {
  return [
    node.triggerType,
    node.eventType ?? '',
    node.label ?? '',
  ].join('\u0000');
}

export function dedupeMatchingTriggerNodes(
  nodes: FlowTriggerNode[],
  details: { flowId: EARS.EntityId; flowTNodeId: EARS.EntityId; eventType: string },
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
      mode: 'skipped',
      flowId: details.flowId,
      flowTNodeId: details.flowTNodeId,
      eventType: details.eventType,
      label: retained.label,
      triggerType: retained.triggerType,
      trackKey,
      retainedNodeId: retained.id,
      skippedNodeIds: skipped.map(node => node.id).filter(Boolean) as EARS.EntityId[],
    };
  });

  const legacyByKey = new Map<string, FlowTriggerNode[]>();
  for (const node of retainedNodes) {
    if (node.trackKey) continue;
    const key = legacySuspicionKey(node);
    legacyByKey.set(key, [...(legacyByKey.get(key) ?? []), node]);
  }

  for (const legacyNodes of legacyByKey.values()) {
    if (legacyNodes.length < 2) continue;
    const [retained, ...duplicates] = legacyNodes;
    warnings.push({
      mode: 'suspicious',
      flowId: details.flowId,
      flowTNodeId: details.flowTNodeId,
      eventType: details.eventType,
      label: retained.label,
      triggerType: retained.triggerType,
      retainedNodeId: retained.id,
      skippedNodeIds: duplicates.map(node => node.id).filter(Boolean) as EARS.EntityId[],
    });
  }

  return {
    nodes: retainedNodes,
    warnings,
  };
}
