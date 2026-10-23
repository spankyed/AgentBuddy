import { query } from '#generated/ears.ts';
import { EARS } from '#generated/ears.ts';
import { services } from '#generated/services.ts';
import { findRelations, untypedQuery } from '@apackdev/sdk/ears';
import type { FlowTNodeData, EventListenerEntity } from '../types.ts';
import type { NodeEntity } from '#generated/types.ts';
import type { FlowNode } from '#extensions/steps/subflow/types.ts';
import { stepRegistry } from '@apackdev/sdk/steps';
import { prepareNodeAttributes, type PreparedAttributes } from './node-attribute-mappers.ts';
import { brainLogger } from '../utils/brain-inspect.ts';
import type { ExecutionContext, RunTree, TNode, TNodeId } from '@apackdev/sdk/steps';
import type { FlowEntity } from '@apackdev/sdk';
// Brain Repository - the flows the brain runs, and their runs in the run history

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

/** The run history: every flow run's nodes, recorded as the brain runs them */
const history = () => services.runHistory;

/** The flow node a node ran under: the nearest flow above it, or undefined for a session's root */
function parentFlowOf(id: TNodeId): TNode | undefined {
  let parentId = history().get(id)?.parentId;
  while (parentId) {
    const parent = history().get(parentId);
    if (!parent || parent.tNodeType === 'flow') return parent;
    parentId = parent.parentId;
  }
  return undefined;
}

function uniqueNodesById<T extends { id?: EARS.EntityId }>(nodes: T[]): T[] {
  const seen = new Set<EARS.EntityId>();
  return nodes.filter(node => {
    if (!node.id || seen.has(node.id)) return false;
    seen.add(node.id);
    return true;
  });
}

const EMPTY_FLOW_DATA: FlowTNodeData = { flowTNodeId: '' as EARS.EntityId, tNodeTree: [], possibleEvents: [], flowHierarchy: [] };

// Queries
export const brainQueries = {
  tNodeById: (id: TNodeId): TNode | undefined => history().get(id),

  eventAllSteps: (eventNodeId: EARS.EntityId): NodeEntity[] => {
    const nodes = query.ids(eventNodeId)
      .outEdges(EARS.RelKind.TRANSITIONS_TO, [EARS.Entity.Node])
      .map(link => query.ids(link.target).pickAll()[0] as unknown as NodeEntity)
      .filter(node => node && node.id);

    return uniqueNodesById(nodes);
  },
  
  // Get next nodes via TRANSITIONS_TO relation
  nextNodeInFlowTrack: (nodeId: EARS.EntityId): NodeEntity => {
    const nextLinks = query.ids(nodeId)
      .outEdges(EARS.RelKind.TRANSITIONS_TO, [EARS.Entity.Node]);

    return nextLinks.map(link => {
      const result = query.ids(link.target).pickAll();
      return result[0] as unknown as NodeEntity;
    }).filter(node => node && node.id)[0];
  },

  // Get next node for a specific branch (used by switch nodes)
  nextNodeForBranch: (nodeId: EARS.EntityId, sourceHandle?: string): NodeEntity | undefined => {
    // Get all TRANSITIONS_TO edges from this node
    const edges = findRelations({
      source: nodeId,
      kind: EARS.RelKind.TRANSITIONS_TO,
    });

    // Find edge matching sourceHandle
    type EdgeInfo = { sourceHandle?: string; targetHandle?: string };
    let edge;
    if (sourceHandle) {
      edge = edges.find((e) => (e.info as EdgeInfo | undefined)?.sourceHandle === sourceHandle);
    } else {
      brainLogger.warn(`nextNodeForBranch called without sourceHandle for node ${nodeId}, falling back to first edge`);
      edge = edges[0];
    }

    if (!edge) return undefined;

    // Get the target node
    const result = query.ids(edge.target).pickAll();
    return result[0] as unknown as NodeEntity | undefined;
  },
  
  /** The event tracks a flow node heard, each with the nodes it ran under it */
  eventTracks: (flowTNodeId: TNodeId): RunTree[] => {
    const flowTNode = history().get(flowTNodeId);
    if (flowTNode?.tNodeType !== 'flow') {
      throw new Error(`TNode ${flowTNodeId} is not a flow type (found: ${flowTNode?.tNodeType || 'none'})`);
    }
    return history().findChildren(flowTNodeId)
      .filter(child => child.tNodeType === 'event')
      .map(event => history().tree(event.id)!);
  },
  
  possibleEvents: (flowTNodeId: TNodeId): EventListenerEntity[] => {
    // The flow this run walks
    const flowId = history().get(flowTNodeId)?.flowId;
    if (!flowId) {
      throw new Error(`Flow TNode ${flowTNodeId} names no flow it runs. This usually means the TNode was not properly initialized.`);
    }

    // All triggers (listeners, schedules, etc.) via registry
    const events: EventListenerEntity[] = [];
    for (const def of stepRegistry.triggers()) {
      const fields = ['id', 'nodeType', 'label', 'trackKey', ...(def.trigger?.queryFields || [])] as const;
      // Untyped: each trigger names its own fields, which only some step node types have
      const triggerNodes = untypedQuery.ids(flowId)
        .out(EARS.RelKind.CONTAINS, [EARS.Entity.Node]).pick(fields)
        .filter((n: any) => n.nodeType === def.type);
      for (const n of triggerNodes as any[]) {
        events.push({
          id: `Event-${n.id}` as EARS.EntityId,
          nodeId: n.id!,
          eventType: `${def.type}.${n.id}`,
          label: n.label || def.node?.label || def.type,
          triggerType: def.type,
          ...def.trigger?.queryFields?.reduce((acc: any, field: string) => {
            if (n[field] !== undefined) acc[field] = n[field];
            return acc;
          }, {}),
        });
      }
    }

    return events;
  },

  /** The flow node a node ran under: the nearest flow above it, or undefined for a session's root */
  parentFlowOf,

  /**
   * Builds flow hierarchy from current flow back to root
   * Returns array ordered from root → current flow
   */
  buildFlowHierarchy: (flowTNodeId: TNodeId): Array<{ flowTNodeId: EARS.EntityId; label: string }> => {
    const hierarchy: Array<{ flowTNodeId: EARS.EntityId; label: string }> = [];
    let current = history().get(flowTNodeId);
    while (current) {
      hierarchy.unshift({ flowTNodeId: current.id, label: current.label || 'Unknown Flow' });
      current = parentFlowOf(current.id);
    }
    return hierarchy;
  },

  /**
   * Where a run node's blueprint is, for revealing it in the Flows surface: the node it ran and the flow holding
   * it. A subflow's node sits in the flow its parent runs, not in the flow it runs itself.
   */
  revealIn: (id: TNodeId): { flowId: EARS.EntityId; nodeId: EARS.EntityId } | undefined => {
    const node = history().get(id);
    const flowId = node?.tNodeType === 'flow' ? parentFlowOf(id)?.flowId : node?.flowId;
    return node?.nodeId && flowId ? { flowId, nodeId: node.nodeId } : undefined;
  },

  extendedTNodeData: (tNodeId: TNodeId): FlowTNodeData => {
    const tNode = history().get(tNodeId);

    if (tNode?.tNodeType !== 'flow') {
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
  
  /** The session's root run, or nothing to show when the brain runs none */
  rootData: (rootRunId: TNodeId | undefined): FlowTNodeData =>
    rootRunId && history().get(rootRunId) ? brainQueries.extendedTNodeData(rootRunId) : EMPTY_FLOW_DATA,
} as const;

// Commands
export const brainCommands = {
  /** An event a flow run heard, with its payload as the node's attributes */
  createEventTNode: (
    eventNode: { id?: string; label?: string; eventType?: string; triggerType?: string; cronExpression?: string },
    flowTNodeId: TNodeId,
    payload: Record<string, unknown>,
  ): TNode => history().start({
    tNodeType: 'event',
    label: eventNode.label || '',
    eventType: eventNode.eventType!,
    triggerType: eventNode.triggerType || 'listener',
    ...(eventNode.cronExpression && { cronExpression: eventNode.cronExpression }),
    nodeAttributes: payload,
    parentId: flowTNodeId,
    // The trigger node it heard, in the flow its parent runs
    ...(eventNode.id && { nodeId: eventNode.id as EARS.EntityId }),
    ...(history().get(flowTNodeId)?.flowId && { flowId: history().get(flowTNodeId)!.flowId }),
  }),
  
  createFlowTNode: (
    flowStepId: EARS.EntityId,
    parentId?: TNodeId,
    executionContext?: ExecutionContext
  ): { flowTNode: TNode; flowId: EARS.EntityId } => {
    // Get the flow reference from the flow node (get all fields for attributes)
    const flowStepNode = query.ids(flowStepId)
      .pickAll()[0] as Partial<FlowNode> | undefined;

    if (!flowStepNode || flowStepNode.nodeType !== 'subflow') {
      throw new Error(
        `Cannot create flow TNode: Node ${flowStepId} is ${flowStepNode?.nodeType || 'missing'}, expected 'subflow' type`
      );
    }

    if (!flowStepNode.flowRef || typeof flowStepNode.flowRef !== 'string') {
      throw new Error(
        `Cannot create flow TNode: Node ${flowStepId} has invalid flowRef: ${JSON.stringify(flowStepNode.flowRef)}`
      );
    }

    // Get the referenced flow
    const flow = query.ids(flowStepNode.flowRef as EARS.EntityId<'Flow'>)
      .pickOne(["id", "label"]) ?? undefined;

    if (!flow) {
      throw new Error(
        `Cannot create flow TNode: Referenced flow ${flowStepNode.flowRef} not found in database`
      );
    }

    const prepared = resolveNodeAttributes(flowStepNode, executionContext);
    const flowTNode = history().start({
      tNodeType: 'flow',
      label: flowStepNode.label || flow.label!,
      stepNodeType: 'subflow',
      ...(parentId && { parentId }),
      // The subflow step it ran, and the flow that step runs
      nodeId: flowStepId,
      flowId: flowStepNode.flowRef as EARS.EntityId,
      nodeAttributes: { ...prepared?.nodeAttributes },
      ...(prepared && { resolvedParams: prepared.resolvedParams }),
      // Preserve the flow node's final status
      ...(flowStepNode.final && { final: true }),
    });

    return { flowTNode, flowId: flowStepNode.flowRef as EARS.EntityId };
  },
  
  createStepTNode: (
    stepId: EARS.EntityId,
    parentId: TNodeId,
    executionContext?: ExecutionContext
  ): { tNode: TNode; step: NodeEntity } => {
    if (!stepId) {
      throw new Error(
        'Cannot create step TNode: Step ID is required'
      );
    }

    const step = query.ids(stepId)
      .pickAll()[0] as Partial<NodeEntity> | undefined;

    if (!step || !step.id) {
      throw new Error(
        `Cannot create step TNode: Node ${stepId} not found in flow blueprint`
      );
    }

    // The flow holding this step
    const flowId = query.ids(stepId).in(EARS.RelKind.CONTAINS, EARS.Entity.Flow).first();
    const prepared = resolveNodeAttributes(step, executionContext);
    const tNode = history().start({
      tNodeType: 'step',
      label: step.label ?? '',
      stepNodeType: step.nodeType,
      parentId,
      nodeId: stepId,
      ...(flowId && { flowId }),
      ...(step.final && { final: true }),
      ...(prepared && { nodeAttributes: prepared.nodeAttributes }),
      ...(prepared && { resolvedParams: prepared.resolvedParams }),
    });

    return { tNode, step: step as NodeEntity };
  },
  
  /** A new session's root run: the root flow the brain starts with, under a new id each time it starts */
  createRootFlowTNode: (): {
    // Only the fields the pick below actually selects — consumers read id/label.
    rootFlow: Pick<FlowEntity, 'id' | 'label' | 'flowType' | 'createdAt'>;
    rootFlowTNode: TNode;
  } => {
    const rootFlow = query(EARS.Entity.Flow)
      .withRole(EARS.RoleKind.ROOT_FLOW)
      .pickOne(["id", "label", "flowType", "createdAt"]);

    if (!rootFlow) {
      throw new Error(
        "Cannot create root flow TNode: No flow with 'root_flow' role found. " +
        "Ensure the database is properly initialized."
      );
    }

    const rootFlowTNode = history().start({
      tNodeType: 'flow',
      label: rootFlow.label,
      flowId: rootFlow.id,
    });
    return { rootFlow, rootFlowTNode };
  },
} as const;
