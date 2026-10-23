import { query } from '#generated/ears.ts';
import { EARS } from '#generated/ears.ts';
import { services } from '#generated/services.ts';
import { findRelations, untypedQuery } from '@apackdev/sdk/ears';
import type { FlowRunNodeData, EventListenerEntity } from '../types.ts';
import type { NodeEntity } from '#generated/types.ts';
import type { FlowNode } from '#extensions/steps/subflow/types.ts';
import { stepRegistry } from '@apackdev/sdk/steps';
import { prepareStepInput } from '../step-input.ts';
import { brainLogger } from '../utils/brain-inspect.ts';
import type { ExecutionContext, RunTree, RunNode, RunNodeId, StepInput } from '@apackdev/sdk/steps';
import type { FlowEntity } from '@apackdev/sdk';
// Brain Repository - the flows the brain runs, and their runs in the run history

/** What a node's run node records of its input: its settings, with the params it resolved under `params` */
function recordedInput({ settings, params }: Omit<StepInput, 'runNodeId'>): Record<string, unknown> {
  return { ...settings, params };
}

/** What a node runs on, whole, when it runs in a track; a node started outside one has neither settings nor params */
function inputOf(node: Partial<NodeEntity>, executionContext?: ExecutionContext): Omit<StepInput, 'runNodeId'> {
  return executionContext && node.nodeType
    ? prepareStepInput(node as NodeEntity, executionContext)
    : { settings: {}, params: {} };
}

/** The run history: every flow run's nodes, recorded as the brain runs them */
const history = () => services.runHistory;

/** The flow node a node ran under: the nearest flow above it, or undefined for a session's root */
function parentFlowOf(id: RunNodeId): RunNode | undefined {
  let parentId = history().get(id)?.parentId;
  while (parentId) {
    const parent = history().get(parentId);
    if (!parent || parent.kind === 'flow') return parent;
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

const EMPTY_FLOW_DATA: FlowRunNodeData = { flowRunNodeId: '' as EARS.EntityId, runNodeTree: [], possibleEvents: [], flowHierarchy: [] };

// Queries
export const brainQueries = {
  runNodeById: (id: RunNodeId): RunNode | undefined => history().get(id),

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
  
  /** The event tracks a flow node heard, each with the nodes it ran under it: a flow node's children are its events */
  eventTracks: (flowRunNodeId: RunNodeId): RunTree[] => {
    const tree = history().tree(flowRunNodeId);
    if (tree?.kind !== 'flow') {
      throw new Error(`RunNode ${flowRunNodeId} is not a flow type (found: ${tree?.kind || 'none'})`);
    }
    return tree.children;
  },
  
  possibleEvents: (flowRunNodeId: RunNodeId): EventListenerEntity[] => {
    // The flow this run walks
    const flowId = history().get(flowRunNodeId)?.flowId;
    if (!flowId) {
      throw new Error(`Flow RunNode ${flowRunNodeId} names no flow it runs. This usually means the RunNode was not properly initialized.`);
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
  buildFlowHierarchy: (flowRunNodeId: RunNodeId): Array<{ flowRunNodeId: EARS.EntityId; label: string }> => {
    const hierarchy: Array<{ flowRunNodeId: EARS.EntityId; label: string }> = [];
    let current = history().get(flowRunNodeId);
    while (current) {
      hierarchy.unshift({ flowRunNodeId: current.id, label: current.label || 'Unknown Flow' });
      current = parentFlowOf(current.id);
    }
    return hierarchy;
  },

  /**
   * Where a run node's blueprint is, for revealing it in the Flows surface: the node it ran and the flow holding
   * it. A subflow's node sits in the flow its parent runs, not in the flow it runs itself.
   */
  revealIn: (id: RunNodeId): { flowId: EARS.EntityId; nodeId: EARS.EntityId } | undefined => {
    const node = history().get(id);
    const flowId = node?.kind === 'flow' ? parentFlowOf(id)?.flowId : node?.flowId;
    return node?.nodeId && flowId ? { flowId, nodeId: node.nodeId } : undefined;
  },

  extendedRunNodeData: (runNodeId: RunNodeId): FlowRunNodeData => {
    const runNode = history().get(runNodeId);

    if (runNode?.kind !== 'flow') {
      throw new Error(
        `Cannot get extended data for RunNode ${runNodeId}: ` +
        `Expected flow type but found ${runNode?.kind || 'none'}`
      );
    }

    return {
      flowRunNodeId: runNodeId,
      runNodeTree: brainQueries.eventTracks(runNodeId),
      possibleEvents: brainQueries.possibleEvents(runNodeId),
      flowHierarchy: brainQueries.buildFlowHierarchy(runNodeId),
    };
  },
  
  /** The session's root run, or nothing to show when the brain runs none */
  rootData: (rootRunId: RunNodeId | undefined): FlowRunNodeData =>
    rootRunId && history().get(rootRunId) ? brainQueries.extendedRunNodeData(rootRunId) : EMPTY_FLOW_DATA,
} as const;

// Commands
export const brainCommands = {
  /** An event a flow run heard, with its payload as the node's attributes */
  createEventRunNode: (
    eventNode: { id?: string; label?: string; eventType?: string; triggerType?: string; cronExpression?: string },
    flowRunNodeId: RunNodeId,
    payload: unknown,
  ): RunNode => history().start({
    kind: 'event',
    label: eventNode.label || '',
    eventType: eventNode.eventType!,
    triggerType: eventNode.triggerType || 'listener',
    ...(eventNode.cronExpression && { cronExpression: eventNode.cronExpression }),
    payload,
    parentId: flowRunNodeId,
    // The trigger node it heard, in the flow its parent runs
    ...(eventNode.id && { nodeId: eventNode.id as EARS.EntityId }),
    ...(history().get(flowRunNodeId)?.flowId && { flowId: history().get(flowRunNodeId)!.flowId }),
  }),
  
  createFlowRunNode: (
    flowStepId: EARS.EntityId,
    parentId?: RunNodeId,
    executionContext?: ExecutionContext
  ): { flowRunNode: RunNode; flowId: EARS.EntityId; input: StepInput } => {
    // Get the flow reference from the flow node (get all fields for attributes)
    const flowStepNode = query.ids(flowStepId)
      .pickAll()[0] as Partial<FlowNode> | undefined;

    if (!flowStepNode || flowStepNode.nodeType !== 'subflow') {
      throw new Error(
        `Cannot create flow RunNode: Node ${flowStepId} is ${flowStepNode?.nodeType || 'missing'}, expected 'subflow' type`
      );
    }

    if (!flowStepNode.flowRef || typeof flowStepNode.flowRef !== 'string') {
      throw new Error(
        `Cannot create flow RunNode: Node ${flowStepId} has invalid flowRef: ${JSON.stringify(flowStepNode.flowRef)}`
      );
    }

    // Get the referenced flow
    const flow = query.ids(flowStepNode.flowRef as EARS.EntityId<'Flow'>)
      .pickOne(["id", "label"]) ?? undefined;

    if (!flow) {
      throw new Error(
        `Cannot create flow RunNode: Referenced flow ${flowStepNode.flowRef} not found in database`
      );
    }

    const input = inputOf(flowStepNode, executionContext);
    const flowRunNode = history().start({
      kind: 'flow',
      label: flowStepNode.label || flow.label!,
      stepNodeType: 'subflow',
      ...(parentId && { parentId }),
      // The subflow step it ran, and the flow that step runs
      nodeId: flowStepId,
      flowId: flowStepNode.flowRef as EARS.EntityId,
      input: recordedInput(input),
      // Preserve the flow node's final status
      ...(flowStepNode.final && { final: true }),
    });

    return { flowRunNode, flowId: flowStepNode.flowRef as EARS.EntityId, input: { runNodeId: flowRunNode.id, ...input } };
  },
  
  createStepRunNode: (
    stepId: EARS.EntityId,
    parentId: RunNodeId,
    executionContext?: ExecutionContext
  ): { runNode: RunNode; step: NodeEntity; input: StepInput } => {
    if (!stepId) {
      throw new Error(
        'Cannot create step RunNode: Step ID is required'
      );
    }

    const step = query.ids(stepId)
      .pickAll()[0] as Partial<NodeEntity> | undefined;

    if (!step || !step.id) {
      throw new Error(
        `Cannot create step RunNode: Node ${stepId} not found in flow blueprint`
      );
    }

    // The flow holding this step
    const flowId = query.ids(stepId).in(EARS.RelKind.CONTAINS, EARS.Entity.Flow).first();
    const input = inputOf(step, executionContext);
    const runNode = history().start({
      kind: 'step',
      label: step.label ?? '',
      stepNodeType: step.nodeType ?? '',
      parentId,
      nodeId: stepId,
      ...(flowId && { flowId }),
      ...(step.final && { final: true }),
      input: recordedInput(input),
    });

    // The run history keeps a bounded copy of the input; the step runs on it whole
    return { runNode, step: step as NodeEntity, input: { runNodeId: runNode.id, ...input } };
  },
  
  /** A new session's root run: the root flow the brain starts with, under a new id each time it starts */
  createRootFlowRunNode: (): {
    // Only the fields the pick below actually selects — consumers read id/label.
    rootFlow: Pick<FlowEntity, 'id' | 'label' | 'flowType' | 'createdAt'>;
    rootFlowRunNode: RunNode;
  } => {
    const rootFlow = query(EARS.Entity.Flow)
      .withRole(EARS.RoleKind.ROOT_FLOW)
      .pickOne(["id", "label", "flowType", "createdAt"]);

    if (!rootFlow) {
      throw new Error(
        "Cannot create root flow RunNode: No flow with 'root_flow' role found. " +
        "Ensure the database is properly initialized."
      );
    }

    const rootFlowRunNode = history().start({
      kind: 'flow',
      label: rootFlow.label,
      flowId: rootFlow.id,
    });
    return { rootFlow, rootFlowRunNode };
  },
} as const;
