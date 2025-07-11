import { EARS } from '@/shared/ears/types';
import { 
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
import { getTimestamp, generateShortCode, generateLabelWithCount, filterSystemFields } from '@/shared/ears/helpers/entity-utils';
import type { 
  FlowEntity, 
  NodeEntity, 
  EdgeEntity, 
  FlowExtendedData, 
  NodeCreateInput, 
  NodeKind,
  FlowsStartupData 
} from '../config/types';
import { availableModels } from '../config/available-models';
import { promptQueries } from '../../prompts/repository';
import { actionQueries } from '../../actions/repository';

/**
 * Flow Repository - Manages flow, node, and edge operations
 */

// Constants
export const FLOW_EDGE_KINDS = [
  EARS.RelKind.TRANSITIONS_TO,
] as const;

export const FLOW_ROLES = {
  ROOT_FLOW: EARS.RoleKind.Custom("root_flow"),
  ENTRY_EVENT: "entry_event",
} as const;

export const NODE_DEFAULTS = {
  TYPE: 'action' as const,
  LABEL: 'New Node',
  DESCRIPTION: '',
} as const;

export const FLOW_ENTRY_NODE = {
  TYPE: 'listen' as const,
  LABEL: 'Flow Entry',
  COLOR: '#1E88E5',
  MODE: 'entry' as const,
  EVENT_TYPE: 'flow.entry',
} as const;

export const FLOW_DEFAULTS = {
  TYPE: 'workflow' as const,
  DESCRIPTION: '',
} as const;

export const FLOW_QUERY_FIELDS = {
  LIST: ["id", "label", "flowType", "status", "createdAt"] as const,
  DETAIL: ["id", "label", "description", "flowType", "status", "createdAt", "updatedAt"] as const,
} as const;

// Node relation configuration
const RELATION_CONFIG = {
  action: {
    field: 'actionId',
    targetEntity: EARS.Entity.Action,
  },
  llm: {
    field: 'promptTemplateId',
    targetEntity: EARS.Entity.Prompt,
  }
} as const;

// Helper functions for node relations
function extractNodeRelations(nodeType: NodeKind, input: NodeCreateInput) {
  const config = RELATION_CONFIG[nodeType as keyof typeof RELATION_CONFIG];
  
  if (!config) {
    return { relations: {}, attributes: input };
  }
  
  const relationId = (input as any)[config.field];
  const attributes = { ...input };
  delete (attributes as any)[config.field];
  
  return {
    relations: { [config.field]: relationId },
    attributes
  };
}

function createNodeRelations(nodeType: NodeKind, nodeId: EARS.EntityId, relations: Record<string, any>) {
  const config = RELATION_CONFIG[nodeType as keyof typeof RELATION_CONFIG];
  
  if (!config) return;
  
  const relationId = relations[config.field];
  if (relationId) {
    tx(nodeId).link(EARS.RelKind.INSTANCE_OF, relationId as EARS.EntityId);
  }
}

function updateNodeRelations(nodeType: NodeKind, nodeId: EARS.EntityId, relations: Record<string, any>) {
  const config = RELATION_CONFIG[nodeType as keyof typeof RELATION_CONFIG];
  
  if (!config) return;
  
  if (config.field in relations) {
    // Remove existing INSTANCE_OF relationships
    tx(nodeId).unlinkIf(EARS.RelKind.INSTANCE_OF);
    
    // Add new relationship if provided
    const relationId = relations[config.field];
    if (relationId) {
      tx(nodeId)
        .merge(config.field, relationId)
        .link(EARS.RelKind.INSTANCE_OF, relationId as EARS.EntityId);
    }
  }
}

function getNodeRelation(node: NodeEntity): NodeEntity {
  const config = RELATION_CONFIG[node.nodeType as keyof typeof RELATION_CONFIG];
  
  if (!config) {
    return node;
  }
  
  // Get the linked entity ID via INSTANCE_OF relationship
  const linkedId = qx(node.id)
    .links(EARS.RelKind.INSTANCE_OF, config.targetEntity)
    .map(({ id }) => id)[0];
  
  if (linkedId) {
    return {
      ...node,
      [config.field]: linkedId
    };
  }
  
  return node;
}

// Queries
export const flowsQueries = {
  rootFlow: (): EARS.EntityId | undefined =>
    qx().withRole(FLOW_ROLES.ROOT_FLOW).first() ?? undefined,
  
  getNodeActionId: (nodeId: EARS.EntityId): EARS.EntityId | undefined => {
    return qx(nodeId)
      .links(EARS.RelKind.INSTANCE_OF, EARS.Entity.Action)
      .map(({ id }) => id)[0];
  },
  
  node: (nodeId: EARS.EntityId): NodeEntity | undefined => {
    // Use pickAll to get all attributes including fieldMappings
    const nodes = qx([nodeId]).pickAll() as unknown as NodeEntity[];
    const node = nodes[0];
    return node ? getNodeRelation(node) : undefined;
  },
  
  flowNodes: (flowId: EARS.EntityId): NodeEntity[] => {
    const nodeIds = qx(flowId)
      .links(EARS.RelKind.CONTAINS, EARS.Entity.Node)
      .map(({ id }) => id);
    
    const nodes = qx(nodeIds).pickAll() as unknown as NodeEntity[];
    
    // Add relation IDs to each node
    return nodes.map(node => getNodeRelation(node));
  },
  
  flowEdges: (flowId: EARS.EntityId): EdgeEntity[] => {
    // Get all nodes in the flow
    const nodes = flowsQueries.flowNodes(flowId);
    const nodeIds = nodes.map(n => n.id).filter(Boolean) as EARS.EntityId[];
    
    const seen = new Set<string>();
    const edges: EdgeEntity[] = [];

    for (const source of nodeIds) {
      qx(source)
        .links(FLOW_EDGE_KINDS, [EARS.Entity.Node])
        // Only include edges where target is also in this flow - might not be necessary if all nodes are in the flow
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
  
  extendedData: (
    flowId: EARS.EntityId,
    include?: keyof FlowExtendedData | (keyof FlowExtendedData)[]
  ): FlowExtendedData => {
    const want = (k: keyof FlowExtendedData) =>
      !include
        ? true
        : Array.isArray(include)
          ? include.includes(k)
          : include === k;

    return {
      nodes: want("nodes") ? flowsQueries.flowNodes(flowId) : [],
      edges: want("edges") ? flowsQueries.flowEdges(flowId) : [],
    };
  },
  
  startupData: (): FlowsStartupData => {
    const flows = qx(EARS.Entity.Flow)
      .orderBy('createdAt', 'desc')
      .pick(FLOW_QUERY_FIELDS.LIST) as Partial<FlowEntity>[];

    const rootFlow = qx(EARS.Entity.Flow)
      .withRole(FLOW_ROLES.ROOT_FLOW)
      .pickOne(FLOW_QUERY_FIELDS.LIST) as Partial<FlowEntity> | undefined;
      
    const flowId = rootFlow?.id ?? 'Flow-1';
    const nodes = flowsQueries.flowNodes(flowId);
    const edges = flowsQueries.flowEdges(flowId);

    const selectedFlow = qx(EARS.Entity.Flow)
      .withRole(FLOW_ROLES.ROOT_FLOW)
      .pickOne(["id"]) as { id: EARS.EntityId };

    return {
      graph: {
        nodes,
        edges,
      },
      flows,
      rootFlow,
      selectedFlowId: selectedFlow.id,
      models: availableModels,
      prompts: promptQueries.all(),
      actions: actionQueries.all(),
    };
  },
} as const;

// Commands
export const flowsCommands = {
  createFlow: (flow?: Partial<FlowEntity>): RepositoryResult<FlowEntity> => {
    try {
      const ts = getTimestamp();
      const shortCode = generateShortCode(EARS.Entity.Flow, 'F');
      const label = flow?.label || generateLabelWithCount('New Flow', EARS.Entity.Flow);

      const newFlow: Omit<FlowEntity, 'id'> = {
        entityType: EARS.Entity.Flow,
        shortCode,
        label,
        description: flow?.description || FLOW_DEFAULTS.DESCRIPTION,
        flowType: flow?.flowType || FLOW_DEFAULTS.TYPE,
        createdAt: ts,
        updatedAt: ts,
      };

      const id = tx(EARS.Entity.Flow)
        .batchPut(newFlow)
        .id();
      
      return successResult({ id, ...newFlow });
    } catch (error) {
      return errorResult(error);
    }
  },
  
  createFlowWithEntryNode: (flow?: Partial<FlowEntity>): RepositoryResult<{ flow: FlowEntity; entryNode: NodeEntity }> => {
    try {
      // Create the flow
      const flowResult = flowsCommands.createFlow(flow);
      if (!flowResult.success) {
        return errorResult(flowResult.error);
      }
      const newFlow = flowResult.data;
      
      // Create the entry node
      const entryNodeResult = flowsCommands.createNode(newFlow.id, {
        nodeType: FLOW_ENTRY_NODE.TYPE,
        label: FLOW_ENTRY_NODE.LABEL,
        color: FLOW_ENTRY_NODE.COLOR,
        mode: FLOW_ENTRY_NODE.MODE,
        eventType: FLOW_ENTRY_NODE.EVENT_TYPE,
      } as Partial<NodeEntity>);
      
      if (!entryNodeResult.success) {
        return errorResult(entryNodeResult.error);
      }
      const entryNode = entryNodeResult.data;
      
      // Establish entry node role
      tx(entryNode.id).grant(FLOW_ROLES.ENTRY_EVENT).id();
      
      // Create EVENT_TRACE relationship from flow to entry node
      tx(newFlow.id).link(EARS.RelKind.EVENT_TRACE, entryNode.id);
      
      return successResult({ flow: newFlow, entryNode });
    } catch (error) {
      return errorResult(error);
    }
  },
  
  createNode: (flowId: EARS.EntityId, nodeData: NodeCreateInput): RepositoryResult<NodeEntity> => {
    try {
      const ts = getTimestamp();
      
      // Determine node type (default to 'action' if not specified)
      const nodeType = nodeData.nodeType || NODE_DEFAULTS.TYPE;
      
      // Extract relations and attributes based on node type
      const { relations, attributes } = extractNodeRelations(nodeType, nodeData);
      
      // Ensure the node has the required fields
      const newNode: Omit<NodeEntity, 'id'> = {
        entityType: EARS.Entity.Node,
        nodeType,
        label: attributes.label || NODE_DEFAULTS.LABEL,
        description: attributes.description || NODE_DEFAULTS.DESCRIPTION,
        createdAt: ts,
        updatedAt: ts,
        ...attributes,
      } as Omit<NodeEntity, 'id'>;

      // Create the node
      const nodeId = tx(EARS.Entity.Node)
        .batchPut(newNode)
        .id();
      
      // Establish relationship from flow to node
      tx(flowId).link(EARS.RelKind.CONTAINS, nodeId);
      
      // Create node-specific relationships
      createNodeRelations(nodeType, nodeId, relations);
      
      return successResult({ id: nodeId, ...newNode } as NodeEntity);
    } catch (error) {
      return errorResult(error);
    }
  },
  
  createEdge: (sourceId: EARS.EntityId, targetId: EARS.EntityId): OperationResult => {
    try {
      // In EARS, edges are relationships, not entities
      // We just create the relationship between the nodes
      tx(sourceId).link(EARS.RelKind.TRANSITIONS_TO, targetId);
      return operationSuccess();
    } catch (error) {
      return errorResult(error);
    }
  },
  
  updateFlowLabel: (flowId: EARS.EntityId, label: string): OperationResult => {
    try {
      const ts = getTimestamp();
      
      tx(flowId)
        .merge("label", label)
        .merge("updatedAt", ts);
      
      return operationSuccess();
    } catch (error) {
      return errorResult(error);
    }
  },
  
  updateNode: (nodeId: EARS.EntityId, updates: NodeCreateInput): OperationResult => {
    try {
      const ts = getTimestamp();
      
      // Get the current node to determine its type
      const currentNode = qx(nodeId).pickOne(['nodeType']) as { nodeType: NodeKind } | undefined;
      if (!currentNode) {
        throw new RepositoryError(`Node ${nodeId} not found`, RepositoryErrorCode.NOT_FOUND);
      }
      
      // Extract relations and attributes based on node type
      const { relations, attributes } = extractNodeRelations(currentNode.nodeType, updates);
      
      // Update node-specific relationships
      updateNodeRelations(currentNode.nodeType, nodeId, relations);
      
      // Filter out system fields and build updates
      const fieldsToUpdate = filterSystemFields(attributes);
      
      // Build the transaction for node attributes
      const transaction = tx(nodeId);
      
      // Update each field
      Object.entries(fieldsToUpdate).forEach(([key, value]) => {
        // For arrays, we need to replace the entire value, not merge
        if (Array.isArray(value)) {
          // First drop the old value, then put the new one
          // ! shouldn't need to do this, but EARS allows multiple attributes with the same key
          transaction.drop(EARS.AttrKind.Custom(key));
          transaction.put(key, value);
        } else {
          transaction.merge(key as any, value);
        }
      });
      
      // Always update the timestamp
      transaction.merge("updatedAt", ts);
      
      return operationSuccess();
    } catch (error) {
      return errorResult(error);
    }
  },
} as const;
