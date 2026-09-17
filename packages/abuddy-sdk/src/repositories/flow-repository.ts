// The flow model's repository: flows, their nodes and the edges between them, and the root flow role.
// The SDK declares these entities (sdk-entities.ts), so it owns their reads and writes; packs build
// their views on top (default-setup's flows repository).
import {
  findRelations, filterSystemFields, generateLabelWithCount, generateShortCode, getTimestamp,
  removeRelationById, RepositoryError, RepositoryErrorCode, tx, untypedQx as qx,
} from '@abuddy/ears';
import { EARS } from '../types/entities.ts';
import { ROOT_FLOW_ROLE, type FlowEntity, type NodeBase } from '../types/sdk-entities.ts';
import type { CompiledRows } from '../build/compilers/flow-compiler.ts';
import { stepRegistry } from '../steps/registry.ts';
import { createLogger } from '../logger/logger.ts';

const logger = createLogger('flows-repository');

/** A Node row: the fields every node has, and its step's own */
export type FlowNode = NodeBase & Record<string, unknown>;

/** What a node is created or updated with: its fields, and for a step with a relation (`action`, `llm`) the id it names */
export type FlowNodeInput = Partial<NodeBase> & Record<string, unknown>;

/** A transition between two of a flow's nodes: the relation's id, and the handles it leaves and enters by */
export interface FlowEdge {
  id: EARS.EntityId;
  kind: EARS.RelKind;
  source: EARS.EntityId;
  target: EARS.EntityId;
  sourceHandle?: string;
  targetHandle?: string;
  info?: Record<string, unknown>;
}

/** The role of the flow the brain runs when the app starts */
export const ROOT_FLOW = EARS.RoleKind.Custom(ROOT_FLOW_ROLE);

const EDGE_KINDS = [EARS.RelKind.TRANSITIONS_TO];

const NODE_DEFAULTS = { TYPE: 'action', LABEL: 'New Node', DESCRIPTION: '' } as const;
const FLOW_DEFAULTS = { TYPE: 'workflow', DESCRIPTION: '' } as const;

type Handles = { sourceHandle?: string; targetHandle?: string };

function handlesMatch(info: unknown, options?: Handles): boolean {
  const handles = info as Handles | undefined;
  return (handles?.sourceHandle || undefined) === (options?.sourceHandle || undefined)
    && (handles?.targetHandle || undefined) === (options?.targetHandle || undefined);
}

/** An edge's stored info: its handles, kept for steps with several outputs (switch) */
const handleInfo = (handles?: Handles): Handles | undefined =>
  handles?.sourceHandle || handles?.targetHandle ? { sourceHandle: handles.sourceHandle, targetHandle: handles.targetHandle } : undefined;

/**
 * Throws unless an edge from `sourceId` to `targetId` with these handles may exist: a trigger receives none, the
 * same edge isn't there twice, and a non-trigger's source handle has one outgoing edge. `except` is an edge being moved.
 */
function assertEdgeAllowed(sourceId: EARS.EntityId, targetId: EARS.EntityId, handles?: Handles, except?: EARS.EntityId): void {
  const isTrigger = (id: EARS.EntityId) => {
    const nodeType = qx(id).pickOne(['nodeType'])?.nodeType;
    return typeof nodeType === 'string' && stepRegistry.isTrigger(nodeType);
  };
  if (isTrigger(targetId)) {
    throw new RepositoryError('Trigger nodes cannot receive incoming connections', RepositoryErrorCode.VALIDATION_ERROR);
  }

  const existing = findRelations({ sourceEntity: sourceId, relationType: EARS.RelKind.TRANSITIONS_TO }).filter((rel) => rel.id !== except);
  if (existing.some((rel) => rel.targetEntity === targetId && handlesMatch(rel.info, handles))) {
    throw new RepositoryError('Edge already exists', RepositoryErrorCode.VALIDATION_ERROR);
  }
  if (!isTrigger(sourceId)) {
    const occupied = existing.some((rel) => {
      const handle = (rel.info as Handles | undefined)?.sourceHandle;
      return handles?.sourceHandle ? handle === handles.sourceHandle : !handle;
    });
    if (occupied) {
      throw new RepositoryError('Source handle already has an outgoing connection', RepositoryErrorCode.VALIDATION_ERROR);
    }
  }
}

/** A trigger node's own validation, run before it's stored */
function validateNode(node: FlowNode): void {
  const result = stepRegistry.getTrigger(node.nodeType)?.validate?.(node);
  if (result && !result.valid) {
    throw new RepositoryError(`Invalid ${node.nodeType} node: ${result.errors.join(', ')}`, RepositoryErrorCode.VALIDATION_ERROR);
  }
}

/** The field a step names its related entity by (`actionId`), from its build facet */
const relationField = (nodeType: string): string | undefined => stepRegistry.getBuild(nodeType)?.relation?.field;

/** A node's input split into its related entity's id (when the input names one) and its own fields */
function splitRelation(nodeType: string, input: FlowNodeInput): { related: Record<string, unknown>; fields: FlowNodeInput } {
  const field = relationField(nodeType);
  if (!field || !(field in input)) return { related: {}, fields: input };
  const { [field]: relatedId, ...fields } = input;
  return { related: { [field]: relatedId }, fields };
}

/** The node with its related entity's id under the step's relation field */
function withRelation(node: FlowNode): FlowNode {
  const field = relationField(node.nodeType);
  if (!field) return node;
  const [linkedId] = qx(node.id).links(EARS.RelKind.INSTANCE_OF).map(({ id }) => id);
  return linkedId ? { ...node, [field]: linkedId } : node;
}

const flowNodeIds = (flowId: EARS.EntityId): EARS.EntityId[] =>
  qx(flowId).links(EARS.RelKind.CONTAINS, EARS.Entity.Node).map(({ id }) => id);

/** Reads and writes of flows, their nodes and edges, and the root flow role */
export const flowRepository = {
  // ── Queries ──────────────────────────────────────────────────────────

  /** The flow with the root role */
  rootFlow: (): EARS.EntityId | undefined => qx().withRole(ROOT_FLOW).first() ?? undefined,

  /** The action an action node runs */
  getNodeActionId: (nodeId: EARS.EntityId): EARS.EntityId | undefined =>
    qx(nodeId).links(EARS.RelKind.INSTANCE_OF, EARS.Entity.Action).map(({ id }) => id)[0],

  /** A node with all its fields, and its related entity's id */
  node: (nodeId: EARS.EntityId): FlowNode | undefined => {
    const [node] = qx([nodeId]).pickAll() as unknown as FlowNode[];
    return node ? withRelation(node) : undefined;
  },

  /** A flow's nodes, each with its related entity's id */
  flowNodes: (flowId: EARS.EntityId): FlowNode[] =>
    (qx(flowNodeIds(flowId)).pickAll() as unknown as FlowNode[]).map(withRelation),

  /** The transitions between a flow's nodes */
  flowEdges: (flowId: EARS.EntityId): FlowEdge[] => {
    const nodeIds = flowNodeIds(flowId);
    const seen = new Set<string>();
    const edges: FlowEdge[] = [];
    for (const source of nodeIds) {
      qx(source)
        .links(EDGE_KINDS, [EARS.Entity.Node])
        .filter(({ id: target }) => nodeIds.includes(target))
        .forEach(({ relation, id: target }) => {
          const [details] = findRelations({ sourceEntity: source, relationType: relation, targetEntity: target });
          if (!details || seen.has(details.id)) return;
          seen.add(details.id);
          const handles = details.info as Handles | undefined;
          edges.push({
            id: details.id, kind: relation, source, target,
            sourceHandle: handles?.sourceHandle, targetHandle: handles?.targetHandle, info: {},
          });
        });
    }
    return edges;
  },

  // ── Flows ────────────────────────────────────────────────────────────

  createFlow: (flow?: Partial<FlowEntity>): FlowEntity => {
    const ts = getTimestamp();
    const row: Omit<FlowEntity, 'id'> & { updatedAt: number } = {
      entityType: EARS.Entity.Flow,
      shortCode: generateShortCode(EARS.Entity.Flow, 'F'),
      label: flow?.label || generateLabelWithCount('New Flow', EARS.Entity.Flow),
      description: flow?.description || FLOW_DEFAULTS.DESCRIPTION,
      flowType: flow?.flowType || FLOW_DEFAULTS.TYPE,
      createdAt: ts,
      updatedAt: ts,
    };
    const id = tx(EARS.Entity.Flow).batchPut(row).id();
    return { id, ...row };
  },

  updateFlowLabel: (flowId: EARS.EntityId, label: string): void => {
    tx(flowId).updateBatch({ label, updatedAt: getTimestamp() });
  },

  /** Deletes a flow with its nodes and their edges; the root flow only with `allowRoot` */
  deleteFlow: (flowId: EARS.EntityId, options?: { allowRoot?: boolean }): void => {
    const isRoot = qx(flowId).withRole(ROOT_FLOW).first();
    if (isRoot && !options?.allowRoot) {
      throw new RepositoryError('Cannot delete the root flow', RepositoryErrorCode.OPERATION_FAILED);
    }
    if (isRoot) tx(flowId).revoke(ROOT_FLOW);

    const nodeIds = flowNodeIds(flowId);
    for (const nodeId of nodeIds) {
      try {
        flowRepository.deleteNode(nodeId);
      } catch (error) {
        logger.warn('Error deleting node during flow deletion', { nodeId, error });
      }
    }
    for (const { id: relId } of findRelations({ sourceEntity: flowId })) {
      try {
        removeRelationById(relId);
      } catch (error) {
        logger.warn('Error removing relation during flow deletion', { relId, error });
      }
    }
    tx(flowId).destroy();
    logger.info('Deleted flow and all its contents', { flowId, deletedNodes: nodeIds.length });
  },

  /** Makes a flow the root flow, taking the role from the previous one */
  grantRootFlowRole: (flowId: EARS.EntityId): void => {
    const current = qx().withRole(ROOT_FLOW).first();
    if (current && current !== flowId) tx(current).revoke(ROOT_FLOW);
    tx(flowId).grant(ROOT_FLOW);
  },

  revokeRootFlowRole: (flowId: EARS.EntityId): void => {
    tx(flowId).revoke(ROOT_FLOW);
  },

  /** Writes compiled flow DSL (`compileFlowDSL`): its rows, relations and roles; a root flow takes the root role */
  importFromDSL: (compiled: CompiledRows): { flowIds: EARS.EntityId[] } => {
    const flowIds: EARS.EntityId[] = [];
    for (const entity of compiled.entity) {
      const { id, ...fields } = entity as { id: EARS.EntityId } & Record<string, unknown>;
      tx(id, true).batchPut(fields);
      if (fields.entityType === EARS.Entity.Flow) flowIds.push(id);
    }
    for (const relation of compiled.relation) {
      tx(relation.source as EARS.EntityId).link(relation.kind, relation.target as EARS.EntityId, relation.info);
    }
    for (const role of compiled.role) {
      if (role.role === ROOT_FLOW) flowRepository.grantRootFlowRole(role.entityId as EARS.EntityId);
      else tx(role.entityId as EARS.EntityId).grant(role.role);
    }
    logger.info('Imported DSL flows', {
      entityCount: compiled.entity.length,
      relationCount: compiled.relation.length,
      roleCount: compiled.role.length,
      flowIds,
    });
    return { flowIds };
  },

  // ── Nodes ────────────────────────────────────────────────────────────

  /** Adds a node to a flow, with its step's defaults under the given fields */
  createNode: (flowId: EARS.EntityId, input: FlowNodeInput): FlowNode => {
    const ts = getTimestamp();
    const nodeType = input.nodeType || NODE_DEFAULTS.TYPE;
    const defaults = stepRegistry.createNodeDefaults(nodeType) as Partial<NodeBase>;
    const { related, fields } = splitRelation(nodeType, input);
    const row = {
      ...defaults,
      ...fields,
      label: fields.label || defaults.label || NODE_DEFAULTS.LABEL,
      description: fields.description || defaults.description || NODE_DEFAULTS.DESCRIPTION,
      entityType: EARS.Entity.Node,
      nodeType,
      createdAt: ts,
      updatedAt: ts,
    };
    validateNode(row as FlowNode);

    const nodeId = tx(EARS.Entity.Node).batchPut(row).id();
    tx(flowId).link(EARS.RelKind.CONTAINS, nodeId);
    const field = relationField(nodeType);
    const relatedId = field && related[field];
    if (relatedId) tx(nodeId).link(EARS.RelKind.INSTANCE_OF, relatedId as EARS.EntityId);
    return { id: nodeId, ...row } as FlowNode;
  },

  /** Updates a node's fields, and its related entity when the step's relation field is given */
  updateNode: (nodeId: EARS.EntityId, updates: FlowNodeInput): void => {
    const ts = getTimestamp();
    const [current] = qx(nodeId).pickAll() as unknown as FlowNode[];
    if (!current) throw new RepositoryError(`Node ${nodeId} not found`, RepositoryErrorCode.NOT_FOUND);

    const { related, fields } = splitRelation(current.nodeType, updates);
    const changed = filterSystemFields(fields);
    validateNode({ ...current, ...changed, updatedAt: ts } as FlowNode);

    const field = relationField(current.nodeType);
    if (field && field in related) {
      const relatedId = related[field];
      tx(nodeId).unlinkIf(EARS.RelKind.INSTANCE_OF);
      if (relatedId) tx(nodeId).update(field, relatedId).link(EARS.RelKind.INSTANCE_OF, relatedId as EARS.EntityId);
      else tx(nodeId).drop(EARS.AttrKind.Custom(field));
    }

    const transaction = tx(nodeId);
    for (const [key, value] of Object.entries(changed)) transaction.update(key, value);
    transaction.update('updatedAt', ts);
  },

  /** Deletes a node with its edges, its flow's link to it and its related entity's link */
  deleteNode: (nodeId: EARS.EntityId): void => {
    const flowId = (qx(EARS.Entity.Flow).ids() as EARS.EntityId[]).find((id) => flowNodeIds(id).includes(nodeId));
    if (!flowId) throw new RepositoryError(`Node ${nodeId} not found in any flow`, RepositoryErrorCode.NOT_FOUND);

    const nodeIds = flowNodeIds(flowId);
    const edges: EARS.EntityId[] = [];
    // Its outgoing edges
    qx(nodeId)
      .links(EDGE_KINDS, EARS.Entity.Node)
      .filter(({ id: target }) => nodeIds.includes(target))
      .forEach(({ relation, id: target }) => {
        const relId = findRelations({ sourceEntity: nodeId, relationType: relation, targetEntity: target })[0]?.id;
        if (relId) edges.push(relId);
      });
    // Its incoming edges
    for (const source of nodeIds) {
      if (source === nodeId) continue;
      qx(source)
        .links(EDGE_KINDS, EARS.Entity.Node)
        .filter(({ id: target }) => target === nodeId)
        .forEach(({ relation }) => {
          const relId = findRelations({ sourceEntity: source, relationType: relation, targetEntity: nodeId })[0]?.id;
          if (relId) edges.push(relId);
        });
    }
    edges.forEach((edgeId) => removeRelationById(edgeId));

    findRelations({ sourceEntity: flowId, relationType: EARS.RelKind.CONTAINS, targetEntity: nodeId })
      .forEach((rel) => removeRelationById(rel.id));
    for (const { id: target } of qx(nodeId).links(EARS.RelKind.INSTANCE_OF)) {
      findRelations({ sourceEntity: nodeId, relationType: EARS.RelKind.INSTANCE_OF, targetEntity: target })
        .forEach((rel) => removeRelationById(rel.id));
    }
    tx(nodeId).destroy();
  },

  // ── Edges ────────────────────────────────────────────────────────────

  /**
   * Connects two nodes. A trigger can't be a target, an identical edge can't be added twice, and a
   * non-trigger's handle has at most one outgoing edge.
   */
  createEdge: (sourceId: EARS.EntityId, targetId: EARS.EntityId, options?: Handles): { relId: EARS.EntityId } => {
    assertEdgeAllowed(sourceId, targetId, options);
    tx(sourceId).link(EARS.RelKind.TRANSITIONS_TO, targetId, handleInfo(options));

    const relId = findRelations({ sourceEntity: sourceId, relationType: EARS.RelKind.TRANSITIONS_TO, targetEntity: targetId })
      .find((rel) => handlesMatch(rel.info, options))?.id;
    if (!relId) throw new RepositoryError('Failed to retrieve created edge ID', RepositoryErrorCode.OPERATION_FAILED);
    return { relId };
  },

  deleteEdge: (edgeId: EARS.EntityId): void => {
    removeRelationById(edgeId);
  },

  /** Moves an edge to new ends and handles, keeping its id; throws, leaving it as it was, when that edge isn't allowed */
  updateEdge: (edgeId: EARS.EntityId, next: { source: EARS.EntityId; target: EARS.EntityId } & Handles): void => {
    assertEdgeAllowed(next.source, next.target, next, edgeId);
    tx(next.source).relPatch(edgeId, { sourceEntity: next.source, targetEntity: next.target, info: handleInfo(next) ?? {} });
  },

  /**
   * Renumbers a node's `<prefix>-<n>` source handles around `pivotIndex`: inserting (direction 1) shifts
   * the handles at and after it up, removing (-1) shifts those after it down
   */
  reindexHandles: (nodeId: EARS.EntityId, prefix: string, pivotIndex: number, direction: 1 | -1): void => {
    const pattern = new RegExp(`^${prefix}-(\\d+)$`);
    const threshold = direction === 1 ? pivotIndex : pivotIndex + 1;
    for (const rel of findRelations({ sourceEntity: nodeId, relationType: EARS.RelKind.TRANSITIONS_TO })) {
      const info = rel.info as { sourceHandle?: string } | undefined;
      const match = info?.sourceHandle?.match(pattern);
      if (!match) continue;
      const index = parseInt(match[1], 10);
      if (index < threshold) continue;
      tx(nodeId).patchLink(EARS.RelKind.TRANSITIONS_TO, rel.targetEntity, {
        newTarget: rel.targetEntity,
        newInfo: { ...info, sourceHandle: `${prefix}-${index + direction}` },
      });
    }
  },
};
