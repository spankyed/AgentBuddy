import { EARS } from '@/shared/ears/types';
import { qx } from '@/shared/ears/helpers/query';
import { tx } from '@/shared/ears/helpers/transaction';
import { descendants } from '@/shared/ears/helpers/graph';
import type { 
  FlowTNodeData, 
  TNodeEntity, 
  TrackEntity, 
  EventListenerEntity,
  TNodeUpdate
} from '../types';
import type { ListenNode } from '@/systems/flows/config/types';
import { RepositoryResult, RepositoryError, RepositoryErrorCode, createEntityWithDefaults, successResult, errorResult } from '@/shared/repository';

/**
 * Brain Repository - Manages execution traces and TNode trees
 */

// Queries
export const brainQueries = {
  // Get root flow TNode
  rootFlowTNode: () => 
    qx(EARS.Entity.TNode)
      .withRole(EARS.RoleKind.Custom("root_trace_node"))
      .first() as EARS.EntityId | undefined,
  
  // Get TNode by ID
  tNodeById: (id: EARS.EntityId) => {
    const nodeCols = ["id", "tNodeType", "label", "status", "startedAt", "createdAt", "eventType", "stepNodeId", "stepNodeType", "nodeAttributes"] as const;
    return qx(id).pickOne(nodeCols) as TNodeEntity | null;
  },
  
  // Build event tracks for a flow TNode
  eventTracks: (flowTNodeId: EARS.EntityId): TrackEntity[] => {
    const nodeCols = ["id", "tNodeType", "label", "status", "startedAt", "createdAt", "eventType", "stepNodeId", "stepNodeType", "nodeAttributes"] as const;
    
    // Get the flow TNode
    const flowTNode = qx(flowTNodeId).pickOne(nodeCols) as TNodeEntity;
    
    if (!flowTNode || flowTNode.tNodeType !== 'flow') {
      throw new Error(`Invalid flow TNode: ${flowTNodeId}`);
    }
    
    // Get all event TNodes tracked by this flow
    const eventTNodes = qx(flowTNodeId)
      .linksPick(EARS.RelKind.TRACKED, nodeCols, [EARS.Entity.TNode]) as TNodeEntity[];
    
    // For each event, get all its spawned descendants
    const eventTracks = eventTNodes.map(eventTNode => {
      const descendantIds = descendants(eventTNode.id!, EARS.RelKind.SPAWNED);
      const descendantTNodes = qx(descendantIds).pick(nodeCols) as TNodeEntity[];
      
      return {
        ...eventTNode,
        children: descendantTNodes.map(child => ({ ...child, children: [] }))
      };
    });
    
    return eventTracks;
  },
  
  // Get possible events for a flow
  possibleEvents: (flowTNodeId: EARS.EntityId): EventListenerEntity[] => {
    // Get the flow blueprint this TNode is an instance of
    const flowLinks = qx(flowTNodeId)
      .links(EARS.RelKind.INSTANCE_OF, [EARS.Entity.Flow]);
    
    if (flowLinks.length === 0) {
      throw new Error(`Flow TNode ${flowTNodeId} has no INSTANCE_OF relation to a flow blueprint`);
    }
    
    const flowId = flowLinks[0].id;
    
    // Get all listener nodes in the flow blueprint
    const listenerNodes = qx(flowId)
      .linksPick(
        EARS.RelKind.CONTAINS,
        ['id', 'label', 'nodeType', 'eventType', 'mode'] as const,
        [EARS.Entity.Node]
      )
      .filter((node: any) => node.nodeType === 'listen') as ListenNode[];
    
    // Convert to EventListenerEntity format
    return listenerNodes.map(node => ({
      id: `Event-${node.id}` as EARS.EntityId,
      nodeId: node.id!,
      eventType: node.eventType,
      label: node.label,
      mode: node.mode
    }));
  },
  
  // Get extended TNode data (combines event tracks and possible events)
  extendedTNodeData: (tNodeId: EARS.EntityId): FlowTNodeData => {
    const tNode = qx(tNodeId).pickOne(["tNodeType"]) as Pick<TNodeEntity, 'tNodeType'> | null;
    
    if (!tNode || tNode.tNodeType !== 'flow') {
      throw new Error(`Invalid flow TNode: ${tNodeId}`);
    }
    
    return {
      flowTNodeId: tNodeId,
      tNodeTree: brainQueries.eventTracks(tNodeId),
      possibleEvents: brainQueries.possibleEvents(tNodeId),
    };
  },
  
  // Get root data (startup data)
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
  // Create a new TNode
  createTNode: (input: {
    label: string;
    description?: string;
    category?: string;
    parameters?: Record<string, any>;
  }): RepositoryResult<TNodeEntity> => {
    try {
      if (!input.label?.trim()) {
        throw new RepositoryError('Label is required', RepositoryErrorCode.VALIDATION_ERROR);
      }

      const tNode = createEntityWithDefaults<TNodeEntity>(
        EARS.Entity.TNode,
        {
          ...input,
          input: input.parameters || {}, // Map parameters -> input
          parameters: undefined,
        } as any,
        'ACT'
      );

      return successResult(tNode);
    } catch (error) {
      return errorResult(error);
    }
  },
} as const;
