import { EARS } from '@/shared/ears/types';
import { tx } from '@/shared/ears/helpers/transaction';
import { emit } from '@/shared/utils/actor-helpers';
import { bus } from '@/systems/_backend/backend';
import { brain } from '@/systems/brain/system';
import type { TNodeEntity, EventReceived } from '@/systems/brain/types';
import type { ListenNode } from '@/systems/flows/types';

/**
 * Create an event TNode and persist it
 */
export function createEventTNode(
  eventNode: ListenNode, 
  parentTNodeId?: EARS.EntityId, 
  systemActor?: any
): TNodeEntity {
  const eventTNode: TNodeEntity = {
    id: `TNode-Event-${Date.now()}` as EARS.EntityId,
    entityType: EARS.Entity.TNode,
    nodeType: 'event',
    label: eventNode.label,
    eventType: eventNode.eventType,
    status: 'active',
    startedAt: Date.now(),
    createdAt: Date.now(),
  };
  
  // Create TNode in database
  tx(eventTNode.id)
    .put('entityType', EARS.Entity.TNode)
    .put('nodeType', eventTNode.nodeType)
    .put('label', eventTNode.label)
    .put('eventType', eventTNode.eventType!)
    .put('status', eventTNode.status)
    .put('startedAt', eventTNode.startedAt)
    .put('createdAt', eventTNode.createdAt);
  
  // Create TRACKED relationship from parent flow
  if (parentTNodeId) {
    tx(parentTNodeId).link(EARS.RelKind.TRACKED, eventTNode.id);
  }
  
  // Emit event about spawned event TNode
  if (systemActor) {
    systemActor.system.get(bus).send(emit(brain, {
      type: 'EVENT_TNODE_SPAWNED',
      tNode: eventTNode,
    }));
  }
  
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
  const flowTNode: TNodeEntity = {
    id: `TNode-Flow-${Date.now()}` as EARS.EntityId,
    entityType: EARS.Entity.TNode,
    nodeType: 'flow',
    label,
    status: 'active',
    startedAt: Date.now(),
    createdAt: Date.now(),
  };
  
  // Create TNode in database
  tx(flowTNode.id)
    .put('entityType', EARS.Entity.TNode)
    .put('nodeType', flowTNode.nodeType)
    .put('label', flowTNode.label)
    .put('status', flowTNode.status)
    .put('startedAt', flowTNode.startedAt)
    .put('createdAt', flowTNode.createdAt)
    .link(EARS.RelKind.INSTANCE_OF, flowId);
  
  // Create SPAWNED relationship from parent
  if (parentTNodeId) {
    tx(parentTNodeId).link(EARS.RelKind.SPAWNED, flowTNode.id);
  }
  
  // Emit event about spawned flow
  if (systemActor) {
    systemActor.system.get(bus).send(emit(brain, {
      type: 'EVENT_TNODE_SPAWNED',
      tNode: flowTNode,
    }));
  }
  
  return flowTNode;
}

/**
 * Create a step TNode and persist it
 */
export function createStepTNode(
  node: any,
  parentTNodeId: EARS.EntityId,
  systemActor?: any
): TNodeEntity {
  const stepTNode: TNodeEntity = {
    id: `TNode-Step-${Date.now()}` as EARS.EntityId,
    entityType: EARS.Entity.TNode,
    nodeType: 'step',
    label: node.label,
    status: 'active',
    startedAt: Date.now(),
    createdAt: Date.now(),
    stepNodeId: node.id,
    stepNodeType: node.nodeType,
  };
  
  // Create TNode in database
  tx(stepTNode.id)
    .put('entityType', EARS.Entity.TNode)
    .put('nodeType', stepTNode.nodeType)
    .put('label', stepTNode.label)
    .put('status', stepTNode.status)
    .put('startedAt', stepTNode.startedAt)
    .put('createdAt', stepTNode.createdAt)
    .put('stepNodeId', stepTNode.stepNodeId!)
    .put('stepNodeType', stepTNode.stepNodeType!);
  
  // Create SPAWNED relationship from parent
  tx(parentTNodeId).link(EARS.RelKind.SPAWNED, stepTNode.id);
  
  // Emit event about spawned step
  if (systemActor) {
    systemActor.system.get(bus).send(emit(brain, {
      type: 'EVENT_TNODE_SPAWNED',
      tNode: stepTNode,
    }));
  }
  
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
  const rootFlowTNode: TNodeEntity = {
    id: `TNode-1` as EARS.EntityId, // Use consistent ID for root
    entityType: EARS.Entity.TNode,
    nodeType: 'flow',
    label,
    status: 'active',
    startedAt: Date.now(),
    createdAt: Date.now(),
  };
  
  // Create root TNode in database
  tx(rootFlowTNode.id)
    .put('entityType', EARS.Entity.TNode)
    .put('nodeType', rootFlowTNode.nodeType)
    .put('label', rootFlowTNode.label)
    .put('status', rootFlowTNode.status)
    .put('startedAt', rootFlowTNode.startedAt)
    .put('createdAt', rootFlowTNode.createdAt)
    .link(EARS.RelKind.INSTANCE_OF, flowId)
    .grant(EARS.RoleKind.Custom("root_trace_node"));
  
  // Emit event about root TNode
  systemActor.system.get(bus).send(emit(brain, {
    type: 'EVENT_TNODE_SPAWNED',
    tNode: rootFlowTNode,
  }));
  
  return rootFlowTNode;
}

/**
 * Update TNode status in database
 */
export function updateTNodeStatus(
  tNodeId: EARS.EntityId, 
  status: TNodeEntity['status'], 
  systemActor?: any
) {
  tx(tNodeId).put('status', status);
  
  if (systemActor) {
    systemActor.system.get(bus).send(emit(brain, {
      type: 'TNODE_UPDATED',
      data: { tNodeId, status },
    }));
  }
} 