import type { ListenerNode } from '@/core/shared-types/flows';
import { EARS } from '@/core/types';

export type FlowTriggerNode = Pick<ListenerNode, 'id' | 'label' | 'eventType'> & {
  triggerType: 'listener' | 'schedule';
  scope?: ListenerNode['scope'];
  cronExpression?: string;
};

export interface TriggerDedupeWarning {
  flowId: EARS.EntityId;
  flowTNodeId: EARS.EntityId;
  eventType: string;
  label?: string;
  triggerType: 'listener' | 'schedule';
  retainedNodeId?: EARS.EntityId;
  skippedNodeIds: EARS.EntityId[];
}

function triggerDedupeKey(node: FlowTriggerNode): string {
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
  const byKey = new Map<string, FlowTriggerNode>();
  const duplicates = new Map<string, FlowTriggerNode[]>();

  for (const node of nodes) {
    const key = triggerDedupeKey(node);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, node);
      continue;
    }

    const skipped = duplicates.get(key) ?? [];
    skipped.push(node);
    duplicates.set(key, skipped);
  }

  const warnings = Array.from(duplicates.entries()).map(([key, skipped]) => {
    const retained = byKey.get(key)!;
    return {
      flowId: details.flowId,
      flowTNodeId: details.flowTNodeId,
      eventType: details.eventType,
      label: retained.label,
      triggerType: retained.triggerType,
      retainedNodeId: retained.id,
      skippedNodeIds: skipped.map(node => node.id).filter(Boolean) as EARS.EntityId[],
    };
  });

  return {
    nodes: Array.from(byKey.values()),
    warnings,
  };
}
