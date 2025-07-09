import { EARS } from '@/shared/ears/types';
import { 
  findById, 
  findAll,
  createEntityWithDefaults,
  updateEntity,
  successResult,
  operationSuccess,
  errorResult,
  RepositoryError,
  RepositoryErrorCode,
  type RepositoryResult,
  type OperationResult
} from '@/shared/repository';
import { qx } from '@/shared/ears/helpers/query';
import { tx } from '@/shared/ears/helpers/transaction';
import { edgeStore } from '@/shared/ears/helpers/edge-store';
import type { 
  FlowEntity, 
  NodeEntity, 
  EdgeEntity, 
  FlowExtendedData,
  FlowsStartupData,
  ModelConfig
} from '../types';
import { availableModels } from '../config/available-models';
import { promptQueries } from '../../prompts/repository';

/**
 * Flows Repository
 */

// Edge kinds used in flows
export const FLOW_EDGE_KINDS = [
  EARS.RelKind.TRANSITIONS_TO,
  EARS.RelKind.BLOCKS,
  EARS.RelKind.DEPENDS_ON,
] as const;

// Queries
export const flowQueries = {
  byId: (id: EARS.EntityId) => 
    findById<FlowEntity>(id),
  
  all: () => 
    findAll<FlowEntity>(EARS.Entity.Flow),
  
  // Get root flow
  rootFlow: () =>
    qx().withRole(EARS.RoleKind.Custom("root_flow")).first() as EARS.EntityId | undefined,
  
  // Get flow nodes
  nodes: (flowId: EARS.EntityId): Partial<NodeEntity>[] => {
    const nodeIds = qx(flowId)
      .links(EARS.RelKind.CONTAINS, EARS.Entity.Node)
      .map(({ id }) => id);
    
    return qx(nodeIds).pickAll() as Partial<NodeEntity>[];
  },
  
  // Get flow edges
  edges: (flowId: EARS.EntityId): EdgeEntity[] => {
    const nodes = flowQueries.nodes(flowId);
    const nodeIds = nodes.map(n => n.id).filter(Boolean) as EARS.EntityId[];
    
    const seen = new Set<string>();
    const edges: EdgeEntity[] = [];

    for (const source of nodeIds) {
      qx(source)
        .links(FLOW_EDGE_KINDS, [EARS.Entity.Node])
        .filter(({ id: targetId }) => nodeIds.includes(targetId))
        .forEach(({ relation, id: target }) => {
          const relId = edgeStore.relIds({
            sourceEntity: source,
            relationType: relation,
            targetEntity: target,
          })[0];

          if (seen.has(relId)) return;
          seen.add(relId);
          
          edges.push({
            id: relId,
            kind: relation,
            source,
            target,
            info: {},
          });
        });
    }
    
    return edges;
  },
  
  // Get extended data
  extendedData: (
    flowId: EARS.EntityId,
    include?: keyof FlowExtendedData | (keyof FlowExtendedData)[]
  ): FlowExtendedData => {
    const want = (k: keyof FlowExtendedData) =>
      !include ? true : Array.isArray(include) ? include.includes(k) : include === k;

    return {
      nodes: want("nodes") ? flowQueries.nodes(flowId) : [],
      edges: want("edges") ? flowQueries.edges(flowId) : [],
    };
  },
  
  // Startup data
  startupData: (): FlowsStartupData => {
    const flows = qx(EARS.Entity.Flow)
      .orderBy('createdAt', 'desc')
      .pick(['id', 'label', 'flowType', 'createdAt']) as Partial<FlowEntity>[];

    const rootFlowId = flowQueries.rootFlow();
    const rootFlow = flows.find(f => f.id === rootFlowId);
    
    const selectedFlowId = rootFlowId || flows[0]?.id || ('Flow-1' as EARS.EntityId);
    const { nodes, edges } = flowQueries.extendedData(selectedFlowId);

    return {
      selectedFlowId,
      graph: { nodes, edges },
      flows,
      rootFlow,
      models: availableModels,
      prompts: promptQueries.all(),
    };
  },
} as const;

// Commands
export const flowCommands = {
  create: (input?: Partial<FlowEntity>): RepositoryResult<FlowEntity> => {
    try {
      const count = qx(EARS.Entity.Flow).count() + 1;
      
      const flow = createEntityWithDefaults<FlowEntity>(
        EARS.Entity.Flow,
        {
          label: `New Flow ${count}`,
          description: '',
          flowType: 'workflow',
          ...input,
        } as any,
        'F'
      );
      
      return successResult(flow);
    } catch (error) {
      return errorResult(error);
    }
  },
  
  createWithEntryNode: (): RepositoryResult<{ flow: FlowEntity; entryNode: NodeEntity }> => {
    try {
      // Create flow
      const flowResult = flowCommands.create();
      if (!flowResult.success) {
        return flowResult as any;
      }
      
      const flow = flowResult.data;
      
      // Create entry node
      const nodeResult = flowCommands.createNode(flow.id, {
        nodeType: 'listen',
        label: 'Flow Entry',
        color: '#1E88E5',
        mode: 'entry',
        eventType: 'flow.entry',
      });
      
      if (!nodeResult.success) {
        return nodeResult as any;
      }
      
      const entryNode = nodeResult.data;
      
      // Establish entry node role
      tx(entryNode.id).grant('entry_event');
      
      // Create EVENT_TRACE relationship
      tx(flow.id).link(EARS.RelKind.EVENT_TRACE, entryNode.id);
      
      return successResult({ flow, entryNode });
    } catch (error) {
      return errorResult(error);
    }
  },
  
  createNode: (flowId: EARS.EntityId, nodeData: Partial<NodeEntity>): RepositoryResult<NodeEntity> => {
    try {
      if (!nodeData.nodeType) {
        throw new RepositoryError('Node type is required', RepositoryErrorCode.VALIDATION_ERROR);
      }
      
      const newNode = createEntityWithDefaults<NodeEntity>(
        EARS.Entity.Node,
        {
          label: 'New Node',
          description: '',
          ...nodeData,
        } as any
      );
      
      // Link to flow
      tx(flowId).link(EARS.RelKind.CONTAINS, newNode.id);
      
      return successResult(newNode);
    } catch (error) {
      return errorResult(error);
    }
  },
  
  createEdge: (sourceId: EARS.EntityId, targetId: EARS.EntityId): OperationResult => {
    try {
      tx(sourceId).link(EARS.RelKind.TRANSITIONS_TO, targetId);
      return operationSuccess();
    } catch (error) {
      return errorResult(error);
    }
  },
  
  updateFlowLabel: (flowId: EARS.EntityId, label: string): OperationResult => {
    try {
      if (!flowQueries.byId(flowId)) {
        throw new RepositoryError(`Flow ${flowId} not found`, RepositoryErrorCode.NOT_FOUND);
      }
      
      updateEntity(flowId, { label });
      return operationSuccess();
    } catch (error) {
      return errorResult(error);
    }
  },
  
  updateNode: (nodeId: EARS.EntityId, updates: Record<string, any>): OperationResult => {
    try {
      // Note: Not checking if node exists to match current behavior
      updateEntity(nodeId, updates);
      return operationSuccess();
    } catch (error) {
      return errorResult(error);
    }
  },
} as const;