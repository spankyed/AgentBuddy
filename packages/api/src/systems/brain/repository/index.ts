import { EARS } from '@/core/types';
import { qx } from '@/core/utils/ears/helpers/query';
import { tx } from '@/core/utils/ears/helpers/transaction';
import { descendants } from '@/core/utils/ears/helpers/graph';
import type { 
  FlowTNodeData, 
  TNodeEntity, 
  TrackEntity, 
  EventListenerEntity,
  TNodeUpdate,
  ExecutionContext
} from '../types';
import type { ListenNode, FlowEntity, FlowNode, NodeEntity } from '@/systems/flows/config/types';
import { 
  RepositoryResult, 
  RepositoryError, 
  RepositoryErrorCode, 
  createEntityWithDefaults, 
  successResult, 
  errorResult,
  operationSuccess,
  type OperationResult
} from '@/core/utils/repository';
import { emit } from '@/core/utils/actor-helpers';
import { bus } from '@/systems/backend';
import { brain } from '@/systems/brain/system';
import { prepareNodeAttributes } from './node-attribute-mappers';

// Brain Repository - Manages execution traces and TNode trees

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
  "createdAt", 
  "eventType", 
  "stepNodeId", 
  "stepNodeType", 
  "nodeAttributes"
] as const;

// Type Guards
function isFlowTNode(tNode: Partial<TNodeEntity> | null): tNode is TNodeEntity & { tNodeType: 'flow' } {
  return tNode?.tNodeType === 'flow';
}

function isEventTNode(tNode: Partial<TNodeEntity> | null): tNode is TNodeEntity & { tNodeType: 'event' } {
  return tNode?.tNodeType === 'event';
}

function isListenNode(node: Partial<NodeEntity>): node is ListenNode {
  return node.nodeType === 'listen';
}

// Helper function to emit TNode events
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

// Queries
export const brainQueries = {
  rootFlowTNode: () => 
    qx(EARS.Entity.TNode)
      .withRole(ROOT_TRACE_NODE_ROLE)
      .first() as EARS.EntityId | undefined,
  
  tNodeById: (id: EARS.EntityId) => {
    return qx(id).pickOne(TNODE_COLUMNS) as TNodeEntity | null;
  },
  
  flowEventNodes: (flowId: EARS.EntityId): ListenNode[] => {
    return qx(flowId)
      .linksPick(
        EARS.RelKind.EVENT_TRACE,
        ["id", "nodeType", "label", "eventType", "mode"] as const,
        [EARS.Entity.Node]
      )
      .filter(isListenNode);
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
  
  // Get next nodes via TRANSITIONS_TO relation
  nextNodeInFlowTrack: (nodeId: EARS.EntityId): NodeEntity => {
    const nextLinks = qx(nodeId)
      .links(EARS.RelKind.TRANSITIONS_TO, [EARS.Entity.Node]);
    
    return nextLinks.map(link => {
      const result = qx(link.id).pickAll();
      return result[0] as unknown as NodeEntity;
    }).filter(node => node && node.id)[0];
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
    
    // For each event, get all its spawned descendants
    const eventTracks = eventTNodes.map(eventTNode => {
      const descendantIds = descendants(eventTNode.id!, EARS.RelKind.SPAWNED);
      const descendantTNodes = qx(descendantIds).pick(TNODE_COLUMNS) as TNodeEntity[];
      
      return {
        ...eventTNode,
        children: descendantTNodes.map(child => ({ ...child, children: [] }))
      };
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
    
    // Get all listener nodes in the flow blueprint
    const listenerNodes = qx(flowId)
      .linksPick(
        EARS.RelKind.CONTAINS,
        ['id', 'label', 'nodeType', 'eventType', 'mode'] as const,
        [EARS.Entity.Node]
      )
      .filter(isListenNode);
    
    // Convert to EventListenerEntity format
    return listenerNodes.map(node => ({
      id: `Event-${node.id}` as EARS.EntityId,
      nodeId: node.id!,
      eventType: node.eventType,
      label: node.label,
      mode: node.mode
    }));
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
    };
  },
  
  rootData: (): FlowTNodeData => {
    const rootFlowTNode = brainQueries.rootFlowTNode();
    
    if (!rootFlowTNode) {
      return {
        flowTNodeId: '' as EARS.EntityId,
        tNodeTree: [],
        possibleEvents: [],
      };
    }
    
    return brainQueries.extendedTNodeData(rootFlowTNode);
  },
} as const;

// Commands
export const brainCommands = {
  createEventTNode: (
    eventNode: ListenNode, 
    flowTNodeId: EARS.EntityId,
    systemActor?: any
  ): RepositoryResult<TNodeEntity> => {
    try {
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
      
      // Emit events
      emitTNodeEvent('TNODE_SPAWNED', { 
        tNode: eventTNode,
        parentId: flowTNodeId,
        eventTNodeId: tNodeId
      }, systemActor);
      
      emitTNodeEvent('EVENT_TNODE_SPAWNED', { tNode: eventTNode }, systemActor);
      
      return successResult(eventTNode);
    } catch (error) {
      return errorResult(error);
    }
  },
  
  createFlowTNode: (
    flowStepId: EARS.EntityId,
    eventTrackId?: EARS.EntityId,
    systemActor?: any,
  ): RepositoryResult<{ flowTNode: TNodeEntity; eventNodes: ListenNode[] }> => {
    try {
      // Get the flow reference from the flow node (get all fields for attributes)
      const flowStepNode = qx(flowStepId)
        .pickAll()[0] as Partial<FlowNode> | undefined;
      
      if (!flowStepNode || flowStepNode.nodeType !== 'flow') {
        throw new RepositoryError(
          `Cannot create flow TNode: Node ${flowStepId} is ${flowStepNode?.nodeType || 'missing'}, expected 'flow' type`,
          RepositoryErrorCode.NOT_FOUND
        );
      }

      // Get the referenced flow
      const flow = qx(flowStepNode.flowRef as EARS.EntityId)
        .pickOne(["id", "label"]) as Partial<FlowEntity> | undefined;
      
      if (!flow) {
        throw new RepositoryError(
          `Cannot create flow TNode: Referenced flow ${flowStepNode.flowRef} not found in database`,
          RepositoryErrorCode.NOT_FOUND
        );
      }

      // Get event nodes for the referenced flow (not the flow step)
      const eventNodes = brainQueries.flowEventNodes(flowStepNode.flowRef as EARS.EntityId);

      const now = Date.now();

      // Prepare node attributes (includes flowRef, fieldMappings, etc.)
      const nodeAttributes: Record<string, any> = {
        flowRef: flowStepNode.flowRef,
        flowLabel: flow.label,
        ...(flowStepNode.fieldMappings && { fieldMappings: flowStepNode.fieldMappings }),
      };

      const flowTNode: Partial<TNodeEntity> = {
        tNodeType: 'flow',
        label: flow.label!,
        status: 'active',
        startedAt: now,
        stepNodeType: 'flow',
        nodeAttributes,
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
      
      return successResult({
        flowTNode: flowTNode as TNodeEntity,
        eventNodes,
      });
    } catch (error) {
      return errorResult(error);
    }
  },
  
  createStepTNode: (
    stepId: EARS.EntityId,
    eventTrackId: EARS.EntityId,
    executionContext?: ExecutionContext,
    systemActor?: any,
  ): RepositoryResult<{ tNode: TNodeEntity; step: NodeEntity }> => {
    try {
      if (!stepId) {
        throw new RepositoryError(
          'Cannot create step TNode: Step ID is required',
          RepositoryErrorCode.VALIDATION_ERROR
        );
      }

      const step = qx(stepId)
        .pickAll()[0] as Partial<NodeEntity> | undefined;

      if (!step) {
        throw new RepositoryError(
          `Cannot create step TNode: Node ${stepId} not found in flow blueprint`,
          RepositoryErrorCode.NOT_FOUND
        );
      }

      const now = Date.now();

      // Prepare node attributes
      let nodeAttributes: Record<string, any> | undefined;
      
      if (executionContext && step.nodeType) {
        nodeAttributes = prepareNodeAttributes(step as NodeEntity, executionContext);
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
      
      return successResult({
        tNode,
        step: step as NodeEntity,
      });
    } catch (error) {
      return errorResult(error);
    }
  },
  
  createRootFlowTNode: (
    systemActor?: any,
  ): RepositoryResult<{
    rootFlow: FlowEntity;
    rootFlowTNode: TNodeEntity;
    eventNodes: ListenNode[];
    entryNode: ListenNode;
  }> => {
    try {
      const now = Date.now();
      const rootId = ROOT_TNODE_ID;

      // Get root flow
      const rootFlow = qx(EARS.Entity.Flow)
        .withRole(ROOT_FLOW_ROLE)
        .pickOne(["id", "label", "flowType", "status", "createdAt"]) as FlowEntity | undefined;
        
      if (!rootFlow) {
        throw new RepositoryError(
          "Cannot create root flow TNode: No flow with 'root_flow' role found. " +
          "Ensure the database is properly initialized.",
          RepositoryErrorCode.NOT_FOUND
        );
      }

      // Get all event nodes
      const eventNodes = brainQueries.flowEventNodes(rootFlow.id);

      // Find the entry event node
      const entryNode = eventNodes.find(node => node.mode === ENTRY_EVENT_MODE);

      if (!entryNode) {
        throw new RepositoryError(
          `Cannot create root flow TNode: No entry event node found in root flow. ` +
          `Found ${eventNodes.length} event nodes but none with mode='entry'`,
          RepositoryErrorCode.NOT_FOUND
        );
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
      
      // Don't emit TNODE_SPAWNED for root - we don't want it in the tree
      // emitTNodeEvent('TNODE_SPAWNED', {
      //   tNode: rootFlowTNode,
      // }, systemActor);
      
      return successResult({
        rootFlow,
        rootFlowTNode,
        eventNodes,
        entryNode,
      });
    } catch (error) {
      return errorResult(error);
    }
  },
  
  updateTNodeStatus: (
    tNodeId: EARS.EntityId, 
    status: TNodeEntity['status'],
    eventTNodeId: EARS.EntityId | undefined,
    systemActor?: any
  ): OperationResult => {
    try {
      tx(tNodeId).update('status', status);

      emitTNodeEvent('TNODE_UPDATED', { 
        data: { tNodeId, status, eventTNodeId }
      }, systemActor);
      
      return operationSuccess();
    } catch (error) {
      return errorResult(error);
    }
  },
} as const;