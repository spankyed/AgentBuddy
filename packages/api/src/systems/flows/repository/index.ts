import { registerRepository } from '@/repository';
import { EARS } from '@/core/types';
import { RepositoryError, RepositoryErrorCode } from '@/core/shared/repository';
import { qx } from '@/core/ears/helpers/query';
import { tx } from '@/core/ears/helpers/transaction';
import { removeRelation } from '@/core/ears/attribute-storage';
import { edgeStore } from '@/core/ears/helpers/edge-store';
import { getTimestamp, generateShortCode, generateLabelWithCount, filterSystemFields } from '@/core/ears/helpers/entity-utils';
import { createLogger } from '@/core/shared/debug/logger';
import type {
  FlowEntity,
  NodeEntity,
  EdgeEntity,
  FlowExtendedData,
  NodeCreateInput,
  NodeKind,
  FlowsConnectedData
} from '../config/types';
import { availableModels } from '../config/available-models';
import { createNodeDefaults, nodeMetadata, validateNode } from '../config/node-config';
import { repository } from '@/repository';
import type { CompiledRows } from '../dsl/compiler';
import { ROOT_FLOW_ROLE } from '../dsl/types';

const logger = createLogger('flows-repository');

function validatePersistableNode(node: NodeEntity): void {
  if (node.nodeType !== 'schedule') return;

  const validation = validateNode(node);
  if (!validation.valid) {
    throw new RepositoryError(
      `Invalid ${node.nodeType} node: ${validation.errors.join(', ')}`,
      RepositoryErrorCode.VALIDATION_ERROR
    );
  }
}

/**
 * Flow Repository - Manages flow, node, and edge operations
 */

// Constants
export const FLOW_EDGE_KINDS = [
  EARS.RelKind.TRANSITIONS_TO,
] as const;

export const FLOW_ROLES = {
  ROOT_FLOW: EARS.RoleKind.Custom(ROOT_FLOW_ROLE),
  ENTRY_EVENT: "entry_event",
} as const;

export const NODE_DEFAULTS = {
  TYPE: 'action' as const,
  LABEL: 'New Node',
  DESCRIPTION: '',
} as const;

export const FLOW_ENTRY_NODE = {
  TYPE: 'listener' as const,
  LABEL: 'Flow Entry',
  COLOR: '#1E88E5',
  SCOPE: 'entry' as const,
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
        .update(config.field, relationId)
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
          // Get full relation details including info (for handle data)
          const relDetails = edgeStore.find({
            sourceEntity: source,
            relationType: relation,
            targetEntity: target,
          })[0];

          if (!relDetails) return;

          const relId = edgeStore.relIds({
            sourceEntity: source,
            relationType: relation,
            targetEntity: target,
          })[0];

          if (seen.has(relId)) return;
          seen.add(relId);

          // Extract handle info from relation details
          const info = relDetails.info as { sourceHandle?: string; targetHandle?: string } | undefined;

          edges.push({
            id: relId,
            kind: relation,
            source,
            target,
            sourceHandle: info?.sourceHandle,
            targetHandle: info?.targetHandle,
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
  
  connectedData: (): FlowsConnectedData => {
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
      .pickOne(["id"]) as { id: EARS.EntityId } | undefined;

    return {
      graph: {
        nodes,
        edges,
      },
      flows,
      rootFlow,
      selectedFlowId: selectedFlow?.id ?? flowId,
      models: availableModels,
      prompts: repository.promptQueries.all(),
      actions: repository.actionQueries.all(),
    };
  },
} as const;

// Commands
export const flowsCommands = {
  createFlow: (flow?: Partial<FlowEntity>): FlowEntity => {
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
    
    return { id, ...newFlow };
  },
  
  createFlowWithEntryNode: (flow?: Partial<FlowEntity>): { flow: FlowEntity; entryNode: NodeEntity } => {
    // Create the flow
    const newFlow = flowsCommands.createFlow(flow);
    
    // Create the entry node
    const entryNode = flowsCommands.createNode(newFlow.id, {
      nodeType: FLOW_ENTRY_NODE.TYPE,
      label: FLOW_ENTRY_NODE.LABEL,
      color: FLOW_ENTRY_NODE.COLOR,
      scope: FLOW_ENTRY_NODE.SCOPE,
      eventType: FLOW_ENTRY_NODE.EVENT_TYPE,
    } as Partial<NodeEntity>);
    
    // Establish entry node role
    tx(entryNode.id).grant(FLOW_ROLES.ENTRY_EVENT).id();

    return { flow: newFlow, entryNode };
  },
  
  createNode: (flowId: EARS.EntityId, nodeData: NodeCreateInput): NodeEntity => {
    const ts = getTimestamp();

    // Determine node type (default to 'action' if not specified)
    const nodeType = nodeData.nodeType || NODE_DEFAULTS.TYPE;

    // Get default values for this node type
    const defaults = createNodeDefaults(nodeType);

    // Extract relations and attributes based on node type
    const { relations, attributes } = extractNodeRelations(nodeType, nodeData);

    // Merge defaults with provided attributes (provided attributes take precedence)
    const mergedAttributes = {
      ...defaults,
      ...attributes,
      label: attributes.label || defaults.label || NODE_DEFAULTS.LABEL,
      description: attributes.description || defaults.description || NODE_DEFAULTS.DESCRIPTION,
    };

    // Ensure the node has the required fields
    const newNode: Omit<NodeEntity, 'id'> = {
      ...mergedAttributes,
      entityType: EARS.Entity.Node,
      nodeType,
      createdAt: ts,
      updatedAt: ts,
    } as Omit<NodeEntity, 'id'>;

    validatePersistableNode(newNode as NodeEntity);

    // Create the node
    const nodeId = tx(EARS.Entity.Node)
      .batchPut(newNode)
      .id();
    
    // Establish relationship from flow to node
    tx(flowId).link(EARS.RelKind.CONTAINS, nodeId);
    
    // Create node-specific relationships
    createNodeRelations(nodeType, nodeId, relations);
    
    return { id: nodeId, ...newNode } as NodeEntity;
  },
  
  createEdge: (
    sourceId: EARS.EntityId,
    targetId: EARS.EntityId,
    options?: { sourceHandle?: string; targetHandle?: string }
  ): { relId: EARS.EntityId } => {
    // Validate: target node must accept inputs (trigger nodes don't)
    const targetAttrs = qx(targetId).pickOne(['nodeType'] as const) as { nodeType?: string } | undefined;
    const isTargetTrigger = targetAttrs?.nodeType && nodeMetadata[targetAttrs.nodeType as NodeKind]?.category === 'trigger';
    if (isTargetTrigger) {
      throw new RepositoryError(
        'Trigger nodes cannot receive incoming connections',
        RepositoryErrorCode.VALIDATION_ERROR
      );
    }

    // Validate: source handle must not already have an outgoing edge (except trigger nodes)
    const sourceAttrs = qx(sourceId).pickOne(['nodeType'] as const) as { nodeType?: string } | undefined;
    const isTrigger = sourceAttrs?.nodeType && nodeMetadata[sourceAttrs.nodeType as NodeKind]?.category === 'trigger';
    if (!isTrigger) {
      const existingEdges = edgeStore.find({ sourceEntity: sourceId, relationType: EARS.RelKind.TRANSITIONS_TO });
      const handleOccupied = existingEdges.some(rel => {
        const relHandle = (rel.info as any)?.sourceHandle;
        if (options?.sourceHandle) return relHandle === options.sourceHandle;
        return !relHandle;
      });
      if (handleOccupied) {
        throw new RepositoryError(
          `Source handle already has an outgoing connection`,
          RepositoryErrorCode.VALIDATION_ERROR
        );
      }
    }

    // In EARS, edges are relationships, not entities
    // Store handle info for switch nodes with multiple outputs
    const info = options?.sourceHandle || options?.targetHandle
      ? { sourceHandle: options.sourceHandle, targetHandle: options.targetHandle }
      : undefined;

    tx(sourceId).link(EARS.RelKind.TRANSITIONS_TO, targetId, info);

    // Get the relation ID that was just created
    const relIds = edgeStore.relIds({
      sourceEntity: sourceId,
      relationType: EARS.RelKind.TRANSITIONS_TO,
      targetEntity: targetId,
    });

    if (relIds.length === 0) {
      throw new RepositoryError('Failed to retrieve created edge ID', RepositoryErrorCode.OPERATION_FAILED);
    }

    return { relId: relIds[0] };
  },
  
  updateFlowLabel: (flowId: EARS.EntityId, label: string): void => {
    const ts = getTimestamp();
    
    tx(flowId).updateBatch({
      label,
      updatedAt: ts
    });
  },
  
  updateNode: (nodeId: EARS.EntityId, updates: NodeCreateInput): void => {
    const ts = getTimestamp();
    
    // Get the current node to determine its type
    const currentNode = qx(nodeId).pickAll()[0] as unknown as NodeEntity | undefined;
    if (!currentNode) {
      throw new RepositoryError(`Node ${nodeId} not found`, RepositoryErrorCode.NOT_FOUND);
    }
    
    // Extract relations and attributes based on node type
    const { relations, attributes } = extractNodeRelations(currentNode.nodeType, updates);
    
    // Filter out system fields and build updates
    const fieldsToUpdate = filterSystemFields(attributes);

    validatePersistableNode({
      ...currentNode,
      ...fieldsToUpdate,
      updatedAt: ts,
    } as NodeEntity);

    // Update node-specific relationships
    updateNodeRelations(currentNode.nodeType, nodeId, relations);
    
    // Build the transaction for node attributes
    const transaction = tx(nodeId);
    
    // Update each field using the new update method that replaces values
    Object.entries(fieldsToUpdate).forEach(([key, value]) => {
      transaction.update(key, value);
    });
    
    // Always update the timestamp
    transaction.update("updatedAt", ts);
  },
  
  deleteNode: (nodeId: EARS.EntityId): void => {
      // First, find the flow that contains this node
      const allFlows = qx(EARS.Entity.Flow).map((flow) => flow) as EARS.EntityId[];
      let containingFlowId: EARS.EntityId | undefined;
      
      for (const flowId of allFlows) {
        const nodeIds = qx(flowId)
          .links(EARS.RelKind.CONTAINS, EARS.Entity.Node)
          .map(({ id }) => id);
        if (nodeIds.includes(nodeId)) {
          containingFlowId = flowId;
          break;
        }
      }
      
      if (!containingFlowId) {
        throw new RepositoryError(`Node ${nodeId} not found in any flow`, RepositoryErrorCode.NOT_FOUND);
      }
      
      const flowId = containingFlowId;
      
      // Get all nodes in the flow to check edges
      const flowNodes = flowsQueries.flowNodes(flowId);
      const nodeIds = flowNodes.map(n => n.id).filter(Boolean) as EARS.EntityId[];
      
      // Remove all edges connected to this node
      const edgesToRemove: EARS.EntityId[] = [];
      
      // Find edges where this node is the source
      qx(nodeId)
        .links(FLOW_EDGE_KINDS, EARS.Entity.Node)
        .filter(({ id: targetId }) => nodeIds.includes(targetId))
        .forEach(({ relation, id: target }) => {
          const relId = edgeStore.relIds({
            sourceEntity: nodeId,
            relationType: relation,
            targetEntity: target,
          })[0];
          if (relId) edgesToRemove.push(relId);
        });
      
      // Find edges where this node is the target
      nodeIds.forEach(sourceId => {
        if (sourceId === nodeId) return;
        
        qx(sourceId)
          .links(FLOW_EDGE_KINDS, EARS.Entity.Node)
          .filter(({ id: targetId }) => targetId === nodeId)
          .forEach(({ relation }) => {
            const relId = edgeStore.relIds({
              sourceEntity: sourceId,
              relationType: relation,
              targetEntity: nodeId,
            })[0];
            if (relId) edgesToRemove.push(relId);
          });
      });
      
      // Remove all edges
      edgesToRemove.forEach(edgeId => removeRelation(edgeId));
      
      // Remove the CONTAINS relationship from flow to node
      const containsRelIds = edgeStore.relIds({
        sourceEntity: flowId,
        relationType: EARS.RelKind.CONTAINS,
        targetEntity: nodeId,
      });
      containsRelIds.forEach(relId => removeRelation(relId));

      // Remove INSTANCE_OF relationships (for action/llm nodes)
      const instanceOfTargets = qx(nodeId)
        .links(EARS.RelKind.INSTANCE_OF)
        .map(({ id }) => id);
        
      instanceOfTargets.forEach(targetId => {
        const instanceOfRelIds = edgeStore.relIds({
          sourceEntity: nodeId,
          relationType: EARS.RelKind.INSTANCE_OF,
          targetEntity: targetId,
        });
        instanceOfRelIds.forEach(relId => removeRelation(relId));
      });
      
      // Finally, delete the node entity
      tx(nodeId).destroy();
  },
  
  deleteEdge: (edgeId: EARS.EntityId): void => {
    // Directly remove the relation using its ID
    removeRelation(edgeId);
  },
  
  updateEdge: (
    edgeId: EARS.EntityId, 
    oldSource: EARS.EntityId,
    oldTarget: EARS.EntityId,
    newSource: EARS.EntityId, 
    newTarget: EARS.EntityId
  ): { newRelId: EARS.EntityId } => {
    // First remove the old relation
    removeRelation(edgeId);
    
    // Then create a new relation with the new connections
    tx(newSource).link(EARS.RelKind.TRANSITIONS_TO, newTarget);
    
    // Get the new relation ID
    const relIds = edgeStore.relIds({
      sourceEntity: newSource,
      relationType: EARS.RelKind.TRANSITIONS_TO,
      targetEntity: newTarget,
    });
    
    if (relIds.length === 0) {
      throw new RepositoryError('Failed to retrieve updated edge ID', RepositoryErrorCode.OPERATION_FAILED);
    }
    
    return { newRelId: relIds[0] };
  },
  
  grantRootFlowRole: (flowId: EARS.EntityId): void => {
    // Revoke from existing root flow if any
    const currentRoot = qx().withRole(FLOW_ROLES.ROOT_FLOW).first();
    if (currentRoot && currentRoot !== flowId) {
      tx(currentRoot).revoke(FLOW_ROLES.ROOT_FLOW);
    }

    tx(flowId).grant(FLOW_ROLES.ROOT_FLOW);
    repository.settingsCommands.updateSettings('plugin', 'flows', ['rootFlowId'], flowId);
  },

  revokeRootFlowRole: (flowId: EARS.EntityId): void => {
    tx(flowId).revoke(FLOW_ROLES.ROOT_FLOW);
  },

  deleteFlow: (flowId: EARS.EntityId): void => {
    // Check if this is the root flow
    const isRootFlow = qx(flowId).withRole(FLOW_ROLES.ROOT_FLOW).first();
    if (isRootFlow) {
      throw new RepositoryError('Cannot delete the root flow', RepositoryErrorCode.OPERATION_FAILED);
    }

    // Get all nodes in the flow
    const nodeIds = qx(flowId)
      .links(EARS.RelKind.CONTAINS, EARS.Entity.Node)
      .map(({ id }) => id);

    // Delete all nodes (which will also delete their edges)
    nodeIds.forEach(nodeId => {
      try {
        flowsCommands.deleteNode(nodeId);
      } catch (error) {
        logger.warn('Error deleting node during flow deletion', { nodeId, error });
      }
    });

    // Remove any remaining relationships
    const remainingRelations = edgeStore.relIds({
      sourceEntity: flowId,
    });
    remainingRelations.forEach(relId => {
      try {
        removeRelation(relId);
      } catch (error) {
        logger.warn('Error removing relation during flow deletion', { relId, error });
      }
    });

    // Finally, delete the flow entity
    tx(flowId).destroy();

    logger.info('Deleted flow and all its contents', { flowId, deletedNodes: nodeIds.length });
  },

  reindexHandles: (nodeId: EARS.EntityId, prefix: string, pivotIndex: number, direction: 1 | -1): void => {
    const pattern = new RegExp(`^${prefix}-(\\d+)$`)
    // Insert (direction=1): shift indices >= pivotIndex up
    // Remove (direction=-1): shift indices > pivotIndex down
    const threshold = direction === 1 ? pivotIndex : pivotIndex + 1
    const relDetails = edgeStore.find({
      sourceEntity: nodeId,
      relationType: EARS.RelKind.TRANSITIONS_TO,
    })

    for (const rel of relDetails) {
      const info = rel.info as { sourceHandle?: string } | undefined
      if (!info?.sourceHandle) continue
      const match = info.sourceHandle.match(pattern)
      if (!match) continue
      const idx = parseInt(match[1], 10)
      if (idx < threshold) continue

      edgeStore.patchOne(
        { sourceEntity: nodeId, relationType: EARS.RelKind.TRANSITIONS_TO, targetEntity: rel.targetEntity },
        { newInfo: { ...info, sourceHandle: `${prefix}-${idx + direction}` } }
      )
    }
  },

  /**
   * Import flows from compiled DSL data
   */
  importFromDSL: (compiled: CompiledRows): { flowIds: EARS.EntityId[] } => {
    const flowIds: EARS.EntityId[] = [];

    // 1. Create all entities
    for (const entity of compiled.entity) {
      const { id, ...attributes } = entity as { id: string; [key: string]: any };

      // Create entity with specific ID
      tx(id as EARS.EntityId, true).batchPut(attributes);

      // Track flow IDs
      if (attributes.entityType === EARS.Entity.Flow) {
        flowIds.push(id as EARS.EntityId);
      }
    }

    // 2. Create all relations
    for (const relation of compiled.relation) {
      tx(relation.source as EARS.EntityId).link(
        relation.kind,
        relation.target as EARS.EntityId,
        relation.info
      );
    }

    // 3. Grant roles
    for (const role of compiled.role) {
      if (role.role === FLOW_ROLES.ROOT_FLOW) {
        flowsCommands.grantRootFlowRole(role.entityId as EARS.EntityId);
      } else {
        tx(role.entityId as EARS.EntityId).grant(role.role);
      }
    }

    logger.info('Imported DSL flows', {
      entityCount: compiled.entity.length,
      relationCount: compiled.relation.length,
      roleCount: compiled.role.length,
      flowIds,
    });

    return { flowIds };
  },
} as const;

registerRepository('flowsQueries', flowsQueries);
registerRepository('flowsCommands', flowsCommands);
