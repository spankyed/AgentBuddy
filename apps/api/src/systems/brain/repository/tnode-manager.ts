import { EARS } from '@/shared/ears/types';
import { tx } from '@/shared/ears/helpers/transaction';
import type { TNodeEntity, ExecutionContext } from '@/systems/brain/types';
import type { FlowEntity, FlowNode, ListenNode, NodeEntity } from '@/systems/flows/types';
import { qx } from '@/shared/ears/helpers/query';
import { emit } from '@/shared/utils/actor-helpers';
import { bus } from '@/systems/_backend/backend';
import { brain } from '@/systems/brain/system';
import { prepareNodeAttributes } from './node-attribute-mappers';

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
 * Get the first step node that transitions from an event node
 */
export function getEventFirstStep(eventNodeId: EARS.EntityId): NodeEntity | undefined {
  const transitionLinks = qx(eventNodeId)
    .links(EARS.RelKind.TRANSITIONS_TO, [EARS.Entity.Node]);
  
  if (transitionLinks.length > 0) {
    return qx(transitionLinks[0].id)
      .pickAll()[0] as unknown as NodeEntity | undefined;
  }
  
  return undefined;
}

/**
 * Get next nodes via TRANSITIONS_TO relation
 */
export function getNextNodes(nodeId: EARS.EntityId): NodeEntity[] {
  const nextLinks = qx(nodeId)
    .links(EARS.RelKind.TRANSITIONS_TO, [EARS.Entity.Node]);
  
  return nextLinks.map(link => {
    // pickAll returns an array, so we need to get the first element
    const result = qx(link.id).pickAll();
    return result[0] as unknown as NodeEntity;
  }).filter(node => node && node.id);
} 

// --------------------------------------------------------------------------------------------------

/**
 * Create an event TNode and persist it
 */
export function createEventTNode(
  eventNode: ListenNode, 
  flowTNodeId: EARS.EntityId,
  systemActor?: any
): TNodeEntity {
  const now = Date.now();
  const tNodeId = tx(EARS.Entity.TNode)
    .batchPut({
      tNodeType: 'event',
      label: eventNode.label,
      eventType: eventNode.eventType!,
      status: 'active',
      startedAt: now,
    })
    .id();
  
  // Create TRACKED relationship from parent flow
  tx(flowTNodeId).link(EARS.RelKind.TRACKED, tNodeId);
  
  const eventTNode: TNodeEntity = {
    id: tNodeId,
    entityType: EARS.Entity.TNode,
    tNodeType: 'event',
    label: eventNode.label,
    eventType: eventNode.eventType,
    status: 'active',
    startedAt: now,
    createdAt: now,
  };
  
  // Emit event to frontend - use new TNODE_SPAWNED event
  emitTNodeEvent('TNODE_SPAWNED', { 
    tNode: eventTNode,
    parentId: flowTNodeId,
    eventTNodeId: tNodeId  // For event nodes, they are their own eventTNodeId
  }, systemActor);
  
        // Also emit EVENT_TNODE_SPAWNED
  emitTNodeEvent('EVENT_TNODE_SPAWNED', { tNode: eventTNode }, systemActor);
  
  return eventTNode;
}

/**
 * Create a flow TNode and persist it
 */
export function createFlowTNode(
  flowStepId: EARS.EntityId,
  eventTrackId?: EARS.EntityId,
  systemActor?: any,
){
  // Get the flow reference from the flow node
  const flowStepNode = qx(flowStepId)
    .pickOne(["id", "nodeType", "flowRef", "label"]) as Partial<FlowNode> | undefined;
  
  if (!flowStepNode || flowStepNode.nodeType !== 'flow') {
    throw new Error(`Flow node ${flowStepId} not found or not a flow type`);
  }

  // Get the referenced flow
  const flow = qx(flowStepNode.flowRef as EARS.EntityId)
    .pickOne(["id", "label"]) as Partial<FlowEntity> | undefined;
  
  if (!flow) {
    throw new Error(`Referenced flow ${flowStepNode.flowRef} not found`);
  }

  // Get event nodes for this flow
  const eventNodes = getFlowEventNodes(flowStepId);

  const now = Date.now();

  const flowTNode: Partial<TNodeEntity> = {
    tNodeType: 'flow',
    label: flow.label!,
    status: 'active',
    startedAt: now,
    // ...(flowStepNode.final && { final: true }),
  };

  const flowTnodeId = tx(EARS.Entity.TNode)
    .batchPut(flowTNode)
    .link(EARS.RelKind.INSTANCE_OF, flowStepId)
    .id();
  
  // Create SPAWNED relationship from parent
  if (eventTrackId) {
    tx(eventTrackId).link(EARS.RelKind.SPAWNED, flowTnodeId);
  }

  Object.assign(flowTNode, { id: flowTnodeId, createdAt: now, entityType: EARS.Entity.TNode });
  
  // Emit TNODE_SPAWNED event
  emitTNodeEvent('TNODE_SPAWNED', { 
    tNode: flowTNode as TNodeEntity,
    parentId: eventTrackId,
    eventTNodeId: eventTrackId
  }, systemActor);
  
  return {
    flowTNode: flowTNode as TNodeEntity,
    eventNodes,
  };
}

/**
 * Create a step TNode and persist it
 */
export function createStepTNode(
  stepId: EARS.EntityId,
  eventTrackId: EARS.EntityId,
  executionContext?: ExecutionContext,
  systemActor?: any,
) {
  if (!stepId) {
    throw new Error('Step ID is required');
  }

  const step = qx(stepId)
  .pickAll()[0] as Partial<NodeEntity> | undefined;

  if (!step) {
    throw new Error(`Flow node ${stepId} not found or not a flow type`);
  }

  const now = Date.now();

  // Prepare node attributes - this creates a complete instantiation with resolved values
  let nodeAttributes: Record<string, any> | undefined;
  
  if (executionContext && step.nodeType) {
    nodeAttributes = prepareNodeAttributes(step as NodeEntity, executionContext);
    console.log('nodeAttributes: ', nodeAttributes);
  }

  const stepTNode: Partial<TNodeEntity> = {
    tNodeType: 'step',
    label: step.label ?? '',
    status: 'active',
    startedAt: now,
    stepNodeId: step.id,
    stepNodeType: step.nodeType,
    ...(step.final && { final: true }),
    ...(nodeAttributes && { nodeAttributes }),
  };

  const tNodeId = tx(EARS.Entity.TNode)
    .batchPut(stepTNode)
    .id();
  
  // Create SPAWNED relationship from parent
  tx(eventTrackId).link(EARS.RelKind.SPAWNED, tNodeId);
  
  const tNode: TNodeEntity = {
    id: tNodeId,
    entityType: EARS.Entity.TNode,
    createdAt: now,
    ...stepTNode
  } as TNodeEntity;
  
  // Emit TNODE_SPAWNED event
  emitTNodeEvent('TNODE_SPAWNED', { 
    tNode,
    parentId: eventTrackId,
    eventTNodeId: eventTrackId
  }, systemActor);
  
  return {
    tNode,
    step: step as NodeEntity,
  };
}

/**
 * Create root flow TNode
 */
export function createRootFlowTNode(
  systemActor?: any,
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
      tNodeType: 'flow',
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
    tNodeType: 'flow',
    label: rootFlow.label!,
    status: 'active',
    startedAt: now,
    createdAt: now,
  };
  
  // Emit TNODE_SPAWNED event for root
  emitTNodeEvent('TNODE_SPAWNED', { 
    tNode: rootFlowTNode,
    // No parentId or eventTNodeId for root
  }, systemActor);
  
  return {
    rootFlow,
    rootFlowTNode,
    eventNodes,
    entryNode, // ! unused currently
  }
}

/**
 * Emit a TNode event
 */
function emitTNodeEvent(
  eventType: 'EVENT_TNODE_SPAWNED' | 'TNODE_SPAWNED' | 'TNODE_UPDATED',
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
 * Update TNode status in database
 */
export function updateTNodeStatus(
  tNodeId: EARS.EntityId, 
  status: TNodeEntity['status'],
  eventTNodeId: EARS.EntityId | undefined,
  systemActor?: any
): void {
  tx(tNodeId).put('status', status);

  emitTNodeEvent('TNODE_UPDATED', { 
    data: { tNodeId, status, eventTNodeId }
  }, systemActor);
} 