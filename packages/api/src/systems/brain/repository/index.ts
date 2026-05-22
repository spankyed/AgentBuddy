import { registerRepository } from '@/repository';
import { EARS } from '@/core/types';
import { qx } from '@/core/ears/helpers/query';
import { tx } from '@/core/ears/helpers/transaction';
import { edgeStore } from '@/core/ears/helpers/edge-store';
import type {
  FlowTNodeData,
  TNodeEntity,
  TrackEntity,
  EventListenerEntity,
  TNodeUpdate,
  ExecutionContext
} from '../types';
import type { ListenerNode, ScheduleNode, FlowEntity, FlowNode, NodeEntity } from '@/core/shared-types/flows';
import { prepareNodeAttributes, type PreparedAttributes } from './node-attribute-mappers';
import { truncateResult } from '../utils/result-truncator';
import { brainLogger } from '../utils/brain-inspect';
// Brain Repository - Manages execution traces and TNode trees

// Helper function to prepare node attributes with optional execution context
function resolveNodeAttributes(
  node: Partial<NodeEntity>,
  executionContext?: ExecutionContext,
): PreparedAttributes | undefined {
  if (executionContext && node.nodeType) {
    return prepareNodeAttributes(node as NodeEntity, executionContext);
  }

  return undefined;
}

// Constants
const ROOT_TNODE_ID = 'TNode-Root' as EARS.EntityId;
const ROOT_TRACE_NODE_ROLE = EARS.RoleKind.Custom("root_trace_node");
const ROOT_FLOW_ROLE = EARS.RoleKind.Custom("root_flow");
const ENTRY_EVENT_MODE = 'entry' as const;

// Common column selections for TNode queries
const TNODE_COLUMNS = [
  "id", 
  "tNodeType", 
  "label", 
  "status", 
  "startedAt",
  "completedAt", 
  "createdAt", 
  "eventType", 
  "triggerType",
  "cronExpression",
  "stepNodeType", 
  "nodeAttributes",
  "blueprint"
] as const;

function buildSpawnedTree(nodeId: EARS.EntityId): TrackEntity {
  const tnode = qx(nodeId).pickOne(TNODE_COLUMNS) as TNodeEntity;
  const directChildIds = qx(nodeId).linksTo(EARS.RelKind.SPAWNED).ids();
  const children = directChildIds.map(childId => buildSpawnedTree(childId));
  return { ...tnode, children };
}

// Type Guards
function isFlowTNode(tNode: Partial<TNodeEntity> | null): tNode is TNodeEntity & { tNodeType: 'flow' } {
  return tNode?.tNodeType === 'flow';
}

function isEventTNode(tNode: Partial<TNodeEntity> | null): tNode is TNodeEntity & { tNodeType: 'event' } {
  return tNode?.tNodeType === 'event';
}

function isListenerNode(node: Partial<NodeEntity>): node is ListenerNode {
  return node.nodeType === 'listener';
}

function isScheduleNode(node: Partial<NodeEntity>): node is ScheduleNode {
  return node.nodeType === 'schedule';
}


// Queries
export const brainQueries = {
  rootFlowTNode: () => 
    qx(EARS.Entity.TNode)
      .withRole(ROOT_TRACE_NODE_ROLE)
      .first() as EARS.EntityId | undefined,
  
  tNodeById: (id: EARS.EntityId) => {
    return qx(id).pickOne(TNODE_COLUMNS) as TNodeEntity | null;
  },
  
  flowEventNodes: (flowId: EARS.EntityId): ListenerNode[] => {
    return qx(flowId)
      .linksPick(
        EARS.RelKind.CONTAINS,
        ["id", "nodeType", "label", "eventType", "scope"] as const,
        [EARS.Entity.Node]
      )
      .filter(isListenerNode);
  },

  flowScheduleNodes: (flowId: EARS.EntityId): ScheduleNode[] => {
    return qx(flowId)
      .linksPick(
        EARS.RelKind.CONTAINS,
        ["id", "nodeType", "label", "cronExpression"] as const,
        [EARS.Entity.Node]
      )
      .filter(isScheduleNode);
  },

  eventFirstStep: (eventNodeId: EARS.EntityId): NodeEntity | undefined => {
    const transitionLinks = qx(eventNodeId)
      .links(EARS.RelKind.TRANSITIONS_TO, [EARS.Entity.Node]);

    if (transitionLinks.length > 0) {
      return qx(transitionLinks[0].id)
        .pickAll()[0] as unknown as NodeEntity | undefined;
    }

    return undefined;
  },

  eventAllSteps: (eventNodeId: EARS.EntityId): NodeEntity[] => {
    return qx(eventNodeId)
      .links(EARS.RelKind.TRANSITIONS_TO, [EARS.Entity.Node])
      .map(link => qx(link.id).pickAll()[0] as unknown as NodeEntity)
      .filter(node => node && node.id);
  },
  
  // Get next nodes via TRANSITIONS_TO relation
  nextNodeInFlowTrack: (nodeId: EARS.EntityId): NodeEntity => {
    const nextLinks = qx(nodeId)
      .links(EARS.RelKind.TRANSITIONS_TO, [EARS.Entity.Node]);

    return nextLinks.map(link => {
      const result = qx(link.id).pickAll();
      return result[0] as unknown as NodeEntity;
    }).filter(node => node && node.id)[0];
  },

  // Get next node for a specific branch (used by switch nodes)
  nextNodeForBranch: (nodeId: EARS.EntityId, sourceHandle?: string): NodeEntity | undefined => {
    // Get all TRANSITIONS_TO edges from this node
    const edges = edgeStore.find({
      sourceEntity: nodeId,
      relationType: EARS.RelKind.TRANSITIONS_TO,
    });

    // Find edge matching sourceHandle
    type EdgeInfo = { sourceHandle?: string; targetHandle?: string };
    let edge;
    if (sourceHandle) {
      edge = edges.find(e => (e.info as EdgeInfo)?.sourceHandle === sourceHandle);
    } else {
      brainLogger.warn(`nextNodeForBranch called without sourceHandle for node ${nodeId}, falling back to first edge`);
      edge = edges[0];
    }

    if (!edge) return undefined;

    // Get the target node
    const result = qx(edge.targetEntity).pickAll();
    return result[0] as unknown as NodeEntity | undefined;
  },
  
  eventTracks: (flowTNodeId: EARS.EntityId): TrackEntity[] => {
    // Get the flow TNode
    const flowTNode = qx(flowTNodeId).pickOne(TNODE_COLUMNS) as TNodeEntity;
    
    if (!isFlowTNode(flowTNode)) {
      throw new Error(`TNode ${flowTNodeId} is not a flow type (found: ${flowTNode?.tNodeType || 'none'})`);
    }
    
    // Get all event TNodes tracked by this flow
    const eventTNodes = qx(flowTNodeId)
      .linksPick(EARS.RelKind.TRACKED, TNODE_COLUMNS, [EARS.Entity.TNode]) as TNodeEntity[];
    
    // For each event, build a hierarchical tree of spawned children
    const eventTracks = eventTNodes.map(eventTNode => {
      const directChildIds = qx(eventTNode.id!).linksTo(EARS.RelKind.SPAWNED).ids();
      const children = directChildIds.map(childId => buildSpawnedTree(childId));
      return { ...eventTNode, children };
    });

    return eventTracks;
  },
  
  possibleEvents: (flowTNodeId: EARS.EntityId): EventListenerEntity[] => {
    // Get the flow blueprint this TNode is an instance of
    const flowLinks = qx(flowTNodeId)
      .links(EARS.RelKind.INSTANCE_OF, [EARS.Entity.Flow]);
    
    if (flowLinks.length === 0) {
      throw new Error(
        `Flow TNode ${flowTNodeId} has no INSTANCE_OF relation to a flow blueprint. ` +
        `This usually means the TNode was not properly initialized.`
      );
    }
    
    const flowId = flowLinks[0].id;
    
    const listeners = brainQueries.flowEventNodes(flowId);
    const schedules = brainQueries.flowScheduleNodes(flowId);

    return [
      ...listeners.map((node): EventListenerEntity => ({
        id: `Event-${node.id}` as EARS.EntityId,
        nodeId: node.id!,
        eventType: node.eventType,
        label: node.label,
        triggerType: 'listener',
        scope: node.scope,
      })),
      ...schedules.map((node): EventListenerEntity => ({
        id: `Event-${node.id}` as EARS.EntityId,
        nodeId: node.id!,
        eventType: `schedule.${node.id}`,
        label: node.label || 'Schedule',
        triggerType: 'schedule',
        cronExpression: node.cronExpression,
      })),
    ];
  },

  /**
   * Builds flow hierarchy from current flow back to root
   * Returns array ordered from root → current flow
   */
  buildFlowHierarchy: (flowTNodeId: EARS.EntityId): Array<{ flowTNodeId: EARS.EntityId; label: string }> => {
    const hierarchy: Array<{ flowTNodeId: EARS.EntityId; label: string }> = [];
    let currentId: EARS.EntityId | undefined = flowTNodeId;

    while (currentId) {
      const node = qx(currentId).pickOne(['label', 'nodeAttributes']) as Pick<TNodeEntity, 'label' | 'nodeAttributes'> | null;
      if (!node) break;

      hierarchy.unshift({ flowTNodeId: currentId, label: node.label || 'Unknown Flow' });
      currentId = node.nodeAttributes?._parentFlowTNodeId as EARS.EntityId | undefined;
    }

    return hierarchy;
  },

  extendedTNodeData: (tNodeId: EARS.EntityId): FlowTNodeData => {
    const tNode = qx(tNodeId).pickOne(["tNodeType"]) as Pick<TNodeEntity, 'tNodeType'> | null;

    if (!isFlowTNode(tNode as TNodeEntity)) {
      throw new Error(
        `Cannot get extended data for TNode ${tNodeId}: ` +
        `Expected flow type but found ${tNode?.tNodeType || 'none'}`
      );
    }

    return {
      flowTNodeId: tNodeId,
      tNodeTree: brainQueries.eventTracks(tNodeId),
      possibleEvents: brainQueries.possibleEvents(tNodeId),
      flowHierarchy: brainQueries.buildFlowHierarchy(tNodeId),
    };
  },
  
  rootData: (): FlowTNodeData => {
    const rootFlowTNode = brainQueries.rootFlowTNode();

    if (!rootFlowTNode) {
      return {
        flowTNodeId: '' as EARS.EntityId,
        tNodeTree: [],
        possibleEvents: [],
        flowHierarchy: [],
      };
    }

    return brainQueries.extendedTNodeData(rootFlowTNode);
  },
} as const;

// Commands
export const brainCommands = {
  createEventTNode: (
    eventNode: Pick<ListenerNode, 'id' | 'label' | 'eventType'> & {
      triggerType?: 'listener' | 'schedule';
      cronExpression?: string;
    },
    flowTNodeId: EARS.EntityId
  ): TNodeEntity => {
    const now = Date.now();
    const triggerType = eventNode.triggerType || 'listener';
    const triggerAttrs = {
      eventType: eventNode.eventType!,
      triggerType,
      ...(eventNode.cronExpression && { cronExpression: eventNode.cronExpression }),
    };
    const tNodeId = tx(EARS.Entity.TNode)
      .batchPut({
        tNodeType: 'event',
        label: eventNode.label,
        ...triggerAttrs,
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
      ...triggerAttrs,
      status: 'active',
      startedAt: now,
      createdAt: now,
    };
    
    return eventTNode;
  },
  
  createFlowTNode: (
    flowStepId: EARS.EntityId,
    eventTrackId?: EARS.EntityId,
    executionContext?: ExecutionContext
  ): { flowTNode: TNodeEntity; flowId: EARS.EntityId; eventNodes: ListenerNode[] } => {
    // Get the flow reference from the flow node (get all fields for attributes)
    const flowStepNode = qx(flowStepId)
      .pickAll()[0] as Partial<FlowNode> | undefined;

    if (!flowStepNode || flowStepNode.nodeType !== 'flow') {
      throw new Error(
        `Cannot create flow TNode: Node ${flowStepId} is ${flowStepNode?.nodeType || 'missing'}, expected 'flow' type`
      );
    }

    if (!flowStepNode.flowRef || typeof flowStepNode.flowRef !== 'string') {
      throw new Error(
        `Cannot create flow TNode: Node ${flowStepId} has invalid flowRef: ${JSON.stringify(flowStepNode.flowRef)}`
      );
    }

    // Get the referenced flow
    const flow = qx(flowStepNode.flowRef as EARS.EntityId)
      .pickOne(["id", "label"]) as Partial<FlowEntity> | undefined;

    if (!flow) {
      throw new Error(
        `Cannot create flow TNode: Referenced flow ${flowStepNode.flowRef} not found in database`
      );
    }

    // Get the parent flow that contains this flow step node
    const allFlows = qx(EARS.Entity.Flow).map((flow) => flow) as EARS.EntityId[];
    let parentFlowId: EARS.EntityId | undefined;
    
    for (const flowId of allFlows) {
      const nodeIds = qx(flowId)
        .links(EARS.RelKind.CONTAINS, EARS.Entity.Node)
        .map(({ id }) => id);
      if (nodeIds.includes(flowStepId)) {
        parentFlowId = flowId;
        break;
      }
    }

    // Get event nodes for the referenced flow (not the flow step)
    const eventNodes = brainQueries.flowEventNodes(flowStepNode.flowRef as EARS.EntityId);

    const now = Date.now();

    const flowPrepared = resolveNodeAttributes(flowStepNode, executionContext);

    const flowTNode: Partial<TNodeEntity> = {
      tNodeType: 'flow',
      label: flowStepNode.label || flow.label!,
      status: 'active',
      startedAt: now,
      stepNodeType: 'flow',
      nodeAttributes: {
        ...(flowPrepared?.nodeAttributes || {}),
        ...(executionContext?.flowTNodeId && { _parentFlowTNodeId: executionContext.flowTNodeId })
      },
      ...(flowPrepared && { resolvedParams: flowPrepared.resolvedParams }),
      ...(parentFlowId && {
        blueprint: {
          nodeId: flowStepId,
          flowId: parentFlowId
        }
      }),
      // Preserve the flow node's final status
      ...(flowStepNode.final && { final: true }),
    };

    // Link to the referenced Flow entity (not the flow step node)
    // This allows possibleEvents to find the event nodes defined in the flow
    const flowTnodeId = tx(EARS.Entity.TNode)
      .batchPut(flowTNode)
      .link(EARS.RelKind.INSTANCE_OF, flowStepNode.flowRef as EARS.EntityId)
      .id();
    
    // Create SPAWNED relationship from parent
    if (eventTrackId) {
      tx(eventTrackId).link(EARS.RelKind.SPAWNED, flowTnodeId);
    }

    Object.assign(flowTNode, { id: flowTnodeId, createdAt: now, entityType: EARS.Entity.TNode });
    
    return {
      flowTNode: flowTNode as TNodeEntity,
      flowId: flowStepNode.flowRef as EARS.EntityId,
      eventNodes,
    };
  },
  
  createStepTNode: (
    stepId: EARS.EntityId,
    eventTrackId: EARS.EntityId,
    executionContext?: ExecutionContext
  ): { tNode: TNodeEntity; step: NodeEntity } => {
    if (!stepId) {
      throw new Error(
        'Cannot create step TNode: Step ID is required'
      );
    }

    const step = qx(stepId)
      .pickAll()[0] as Partial<NodeEntity> | undefined;

    if (!step || !step.id) {
      throw new Error(
        `Cannot create step TNode: Node ${stepId} not found in flow blueprint`
      );
    }

    // Get the flow that contains this step node
    const allFlows = qx(EARS.Entity.Flow).map((flow) => flow) as EARS.EntityId[];
    let flowId: EARS.EntityId | undefined;
    
    for (const fid of allFlows) {
      const nodeIds = qx(fid)
        .links(EARS.RelKind.CONTAINS, EARS.Entity.Node)
        .map(({ id }) => id);
      if (nodeIds.includes(stepId)) {
        flowId = fid;
        break;
      }
    }

    const now = Date.now();

    // Prepare node attributes and resolved params
    const prepared = resolveNodeAttributes(step, executionContext);

    const stepTNode: Partial<TNodeEntity> = {
      tNodeType: 'step',
      label: step.label ?? '',
      status: 'active',
      startedAt: now,
      stepNodeType: step.nodeType,
      ...(flowId && {
        blueprint: {
          nodeId: stepId,
          flowId: flowId
        }
      }),
      ...(step.final && { final: true }),
      ...(prepared && { nodeAttributes: prepared.nodeAttributes }),
      ...(prepared && { resolvedParams: prepared.resolvedParams }),
    };

    const tNodeId = tx(EARS.Entity.TNode)
      .batchPut(stepTNode)
      .link(EARS.RelKind.INSTANCE_OF, stepId)
      .id();
    
    // Create SPAWNED relationship from parent
    tx(eventTrackId).link(EARS.RelKind.SPAWNED, tNodeId);
    
    const tNode: TNodeEntity = {
      id: tNodeId,
      entityType: EARS.Entity.TNode,
      createdAt: now,
      ...stepTNode
    } as TNodeEntity;
    
    return {
      tNode,
      step: step as NodeEntity,
    };
  },
  
  createRootFlowTNode: (): {
    rootFlow: FlowEntity;
    rootFlowTNode: TNodeEntity;
    eventNodes: ListenerNode[];
    entryNode?: ListenerNode;
  } => {
    const now = Date.now();
    const rootId = ROOT_TNODE_ID;

    // Get root flow
    const rootFlow = qx(EARS.Entity.Flow)
      .withRole(ROOT_FLOW_ROLE)
      .pickOne(["id", "label", "flowType", "status", "createdAt"]) as FlowEntity | undefined;
      
    if (!rootFlow) {
      throw new Error(
        "Cannot create root flow TNode: No flow with 'root_flow' role found. " +
        "Ensure the database is properly initialized."
      );
    }

    // Get all event nodes
    const eventNodes = brainQueries.flowEventNodes(rootFlow.id);

    // Find the entry event node
    const entryNode = eventNodes.find(node => node.scope === ENTRY_EVENT_MODE);

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
      .grant(ROOT_TRACE_NODE_ROLE);
    
    const rootFlowTNode: TNodeEntity = {
      id: rootId,
      entityType: EARS.Entity.TNode,
      tNodeType: 'flow',
      label: rootFlow.label!,
      status: 'active',
      startedAt: now,
      createdAt: now,
    };
    
    return {
      rootFlow,
      rootFlowTNode,
      eventNodes,
      entryNode,
    };
  },
  
  updateTNodeStatus: (
    tNodeId: EARS.EntityId, 
    status: TNodeEntity['status']
  ): void => {
    if (status === 'completed') {
      // Set both status and completedAt timestamp
      tx(tNodeId)
        .update('status', status)
        .update('completedAt', Date.now());
    } else {
      tx(tNodeId).update('status', status);
    }
  },
  
  updateTNodeResult: (
    tNodeId: EARS.EntityId,
    result: any
  ): void => {
    // Truncate the result to prevent memory overflow
    const truncatedResult = truncateResult(result);
    
    // Get current nodeAttributes
    const tNode = qx(tNodeId).pickOne(['nodeAttributes']) as Pick<TNodeEntity, 'nodeAttributes'> | null;
    
    if (tNode) {
      // Merge truncated result into existing nodeAttributes
      const updatedAttributes = {
        ...(tNode.nodeAttributes || {}),
        result: truncatedResult
      };
      
      tx(tNodeId).update('nodeAttributes', updatedAttributes);
    }
  },
  
  updateTNodeAttributes: (
    tNodeId: EARS.EntityId,
    attributes: any
  ): void => {
    // Truncate the attributes to prevent memory overflow
    const truncatedAttributes = truncateResult(attributes);
    
    // Directly set nodeAttributes (for event TNodes that store payload as attributes)
    tx(tNodeId).update('nodeAttributes', truncatedAttributes);
  },
  
  clearVolatileData: (): void => {
    // Get all TNode entities (volatile execution data)
    const allTNodes = qx(EARS.Entity.TNode).ids();

    // Destroy each TNode entity without persisting (volatile data)
    allTNodes.forEach(tNodeId => {
      tx(tNodeId).destroy(true); // skip persistence for volatile data
    });

    brainLogger.info(`Cleared ${allTNodes.length} volatile TNode entities from memory`);
  },
} as const;

registerRepository('brainQueries', brainQueries);
registerRepository('brainCommands', brainCommands);
