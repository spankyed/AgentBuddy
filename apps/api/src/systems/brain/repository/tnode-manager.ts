import { EARS } from '@/shared/ears/types';
import { tx } from '@/shared/ears/helpers/transaction';
import { emit } from '@/shared/utils/actor-helpers';
import { bus } from '@/systems/_backend/backend';
import { brain } from '@/systems/brain/system';
import type { TNodeEntity } from '@/systems/brain/types';
import type { FlowEntity, FlowNode, ListenNode, NodeEntity } from '@/systems/flows/types';
import { qx } from '@/shared/ears/helpers/query';

/**
 * Get event nodes for a specific flow
 */
function getFlowEventNodes(flowId: EARS.EntityId): ListenNode[] {
  return qx(flowId)
    .linksPick(
      EARS.RelKind.EVENT_TRACE,
      ["id", "nodeType", "label", "eventType", "mode"] as const,
      [EARS.Entity.Node]
    )
    .filter((node: any) => node.nodeType === 'listen') as ListenNode[];
}

/**
 * Get responder node for an event node
 */
export function getEventResponderNode(eventNodeId: EARS.EntityId): NodeEntity | undefined {
  const responderLinks = qx(eventNodeId)
    .links(EARS.RelKind.RESPONDER, [EARS.Entity.Node]);
  
  if (responderLinks.length > 0) {
    return qx(responderLinks[0].id)
      .pickOne(["id", "nodeType", "label"]) as NodeEntity;
  }
  
  return undefined;
}

/**
 * Get next nodes via TRANSITIONS_TO relation
 */
export function getNextNodes(nodeId: EARS.EntityId): NodeEntity[] {
  const nextLinks = qx(nodeId)
    .links(EARS.RelKind.TRANSITIONS_TO, [EARS.Entity.Node]);
  
  return nextLinks.map(link => 
    qx(link.id).pickOne(["id", "nodeType", "label"]) as NodeEntity
  );
} 

// --------------------------------------------------------------------------------------------------

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
  parentTNodeId?: EARS.EntityId
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
  
  return eventTNode;
}

/**
 * Create a flow TNode and persist it
 */
export function createFlowTNode(
  flowId: EARS.EntityId,
  eventTrackId?: EARS.EntityId,
  // systemActor?: any
){
  // Get the flow reference from the flow node
  const flowNode = qx(flowId)
    .pickOne(["id", "nodeType", "flowRef", "label"]) as Partial<FlowNode> | undefined;
  
  if (!flowNode || flowNode.nodeType !== 'flow') {
    throw new Error(`Flow node ${flowId} not found or not a flow type`);
  }

  // Get the referenced flow
  const flow = qx(flowNode.flowRef as EARS.EntityId)
    .pickOne(["id", "label"]) as Partial<FlowEntity> | undefined;
  
  if (!flow) {
    throw new Error(`Referenced flow ${flowNode.flowRef} not found`);
  }

  // Get event nodes for this flow
  const eventNodes = getFlowEventNodes(flowId);

  const now = Date.now();
  const transaction = tx(EARS.Entity.TNode)
    .batchPut({
      nodeType: 'flow',
      label: flow.label!,
      status: 'active',
      startedAt: now,
    })
    .link(EARS.RelKind.INSTANCE_OF, flowId);
  
  // Create SPAWNED relationship from parent
  if (eventTrackId) {
    tx(eventTrackId).link(EARS.RelKind.SPAWNED, transaction.id());
  }
  
  const flowTNode: TNodeEntity = {
    id: transaction.id(),
    entityType: EARS.Entity.TNode,
    nodeType: 'flow',
    label: flow.label!,
    status: 'active',
    startedAt: now,
    createdAt: now,
  };
  
  // Emit event
  // emitTNodeEvent('EVENT_TNODE_SPAWNED', { tNode: flowTNode }, systemActor);
  
  return {
    flowTNode,
    eventNodes,
  };
}

/**
 * Create a step TNode and persist it
 */
export function createStepTNode(
  node: NodeEntity,
  eventTrackId: EARS.EntityId,
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
  tx(eventTrackId).link(EARS.RelKind.SPAWNED, tNodeId);
  
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
  
  return stepTNode;
}

/**
 * Create root flow TNode
 */
export function createRootFlowTNode(
) {
  const now = Date.now();
  const rootId = 'TNode-Root' as EARS.EntityId; // For the root flow, we specify an ID for consistency

  // Get root flow
  const rootFlow = qx(EARS.Entity.Flow)
    .withRole(EARS.RoleKind.Custom("root_flow"))
    .pickOne(["id", "label", "flowType", "status", "createdAt"]) as FlowEntity | undefined;
    
  if (!rootFlow) {
    throw new Error("No root flow found");
  }

  // Get all nodes that have EVENT_TRACE relation from the root flow
  const eventNodes = getFlowEventNodes(rootFlow.id);

  // Find the entry event node - check mode instead of role
  const entryNode = eventNodes.find(node => node.mode === 'entry');

  if (!entryNode) {
    throw new Error("No entry event node found");
  }

  tx(rootId)
    .batchPut({
      entityType: EARS.Entity.TNode,
      nodeType: 'flow',
      label: rootFlow.label!,
      status: 'active',
      startedAt: now,
      createdAt: now,
    })
    .link(EARS.RelKind.INSTANCE_OF, rootFlow.id)
    .grant(EARS.RoleKind.Custom("root_trace_node"));
  
  const rootFlowTNode: TNodeEntity = {
    id: rootId,
    entityType: EARS.Entity.TNode,
    nodeType: 'flow',
    label: rootFlow.label!,
    status: 'active',
    startedAt: now,
    createdAt: now,
  };
  
  return {
    rootFlow,
    rootFlowTNode,
    eventNodes,
    entryNode, // ! unused currently
  }
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