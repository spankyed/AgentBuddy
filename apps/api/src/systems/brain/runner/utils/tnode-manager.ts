import { EARS } from '@/shared/ears/types';
import { tx } from '@/shared/ears/helpers/transaction';
import { emit } from '@/shared/utils/actor-helpers';
import { bus } from '@/systems/_backend/backend';
import { brain } from '@/systems/brain/system';
import type { TNodeEntity } from '@/systems/brain/types';
import type { ListenNode, NodeEntity } from '@/systems/flows/types';

/**
 * Emit a TNode event
 */
function emitTNodeEvent(
  eventType: 'EVENT_TNODE_SPAWNED' | 'TNODE_UPDATED',
  data: any,
  systemActor?: any
) {
  if (!systemActor) return;
  
  systemActor.system.get(bus).send(emit(brain, {
    type: eventType,
    ...data
  }));
}

/**
 * Create an event TNode and persist it
 */
export function createEventTNode(
  eventNode: ListenNode, 
  parentTNodeId?: EARS.EntityId, 
  systemActor?: any
): TNodeEntity {
  const now = Date.now();
  const tNodeId = tx(EARS.Entity.TNode)
    .batchPut({
      nodeType: 'event',
      label: eventNode.label,
      eventType: eventNode.eventType!,
      status: 'active',
      startedAt: now,
    })
    .id();
  
  // Create TRACKED relationship from parent flow
  if (parentTNodeId) {
    tx(parentTNodeId).link(EARS.RelKind.TRACKED, tNodeId);
  }
  
  const eventTNode: TNodeEntity = {
    id: tNodeId,
    entityType: EARS.Entity.TNode,
    nodeType: 'event',
    label: eventNode.label,
    eventType: eventNode.eventType,
    status: 'active',
    startedAt: now,
    createdAt: now,
  };
  
  // Emit event
  emitTNodeEvent('EVENT_TNODE_SPAWNED', { tNode: eventTNode }, systemActor);
  
  return eventTNode;
}

/**
 * Create a flow TNode and persist it
 */
export function createFlowTNode(
  flowId: EARS.EntityId,
  label: string,
  parentTNodeId?: EARS.EntityId,
  systemActor?: any
): TNodeEntity {
  const now = Date.now();
  const transaction = tx(EARS.Entity.TNode)
    .batchPut({
      nodeType: 'flow',
      label: label,
      status: 'active',
      startedAt: now,
    })
    .link(EARS.RelKind.INSTANCE_OF, flowId);
  
  // Create SPAWNED relationship from parent
  if (parentTNodeId) {
    tx(parentTNodeId).link(EARS.RelKind.SPAWNED, transaction.id());
  }
  
  const flowTNode: TNodeEntity = {
    id: transaction.id(),
    entityType: EARS.Entity.TNode,
    nodeType: 'flow',
    label,
    status: 'active',
    startedAt: now,
    createdAt: now,
  };
  
  // Emit event
  emitTNodeEvent('EVENT_TNODE_SPAWNED', { tNode: flowTNode }, systemActor);
  
  return flowTNode;
}

/**
 * Create a step TNode and persist it
 */
export function createStepTNode(
  node: NodeEntity,
  parentTNodeId: EARS.EntityId,
  systemActor?: any
): TNodeEntity {
  const now = Date.now();
  const tNodeId = tx(EARS.Entity.TNode)
    .batchPut({
      nodeType: 'step',
      label: node.label,
      status: 'active',
      startedAt: now,
      stepNodeId: node.id!,
      stepNodeType: node.nodeType,
      ...(node.final && { final: true }),
    })
    .id();
  
  // Create SPAWNED relationship from parent
  tx(parentTNodeId).link(EARS.RelKind.SPAWNED, tNodeId);
  
  const stepTNode: TNodeEntity = {
    id: tNodeId,
    entityType: EARS.Entity.TNode,
    nodeType: 'step',
    label: node.label,
    status: 'active',
    startedAt: now,
    createdAt: now,
    stepNodeId: node.id,
    stepNodeType: node.nodeType,
    ...(node.final && { final: true }),
  };
  
  // Emit event
  emitTNodeEvent('EVENT_TNODE_SPAWNED', { tNode: stepTNode }, systemActor);
  
  return stepTNode;
}

/**
 * Create root flow TNode
 */
export function createRootFlowTNode(
  flowId: EARS.EntityId,
  label: string,
  systemActor: any
): TNodeEntity {
  const now = Date.now();
  // For root, we use a specific ID for consistency
  const rootId = 'TNode-1' as EARS.EntityId;
  
  tx(rootId)
    .batchPut({
      entityType: EARS.Entity.TNode,
      nodeType: 'flow',
      label: label,
      status: 'active',
      startedAt: now,
      createdAt: now,
    })
    .link(EARS.RelKind.INSTANCE_OF, flowId)
    .grant(EARS.RoleKind.Custom("root_trace_node"));
  
  const rootFlowTNode: TNodeEntity = {
    id: rootId,
    entityType: EARS.Entity.TNode,
    nodeType: 'flow',
    label,
    status: 'active',
    startedAt: now,
    createdAt: now,
  };
  
  // Emit event
  emitTNodeEvent('EVENT_TNODE_SPAWNED', { tNode: rootFlowTNode }, systemActor);
  
  return rootFlowTNode;
}

/**
 * Update TNode status in database
 */
export function updateTNodeStatus(
  tNodeId: EARS.EntityId, 
  status: TNodeEntity['status'], 
  systemActor?: any
): void {
  tx(tNodeId).put('status', status);
  
  emitTNodeEvent('TNODE_UPDATED', { data: { tNodeId, status } }, systemActor);
} 