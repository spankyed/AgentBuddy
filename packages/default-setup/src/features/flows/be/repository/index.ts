import { tx, qx } from '@/__generated__/ears';
import { EARS } from '@/__generated__/ears';
import { flowRepository } from '@abuddy/sdk/ears';
import type {
  NodeEntity,
  EdgeEntity,
  FlowExtendedData,
  NodeCreateInput,
  FlowsConnectedData
} from '../types';
import { availableModels } from '@abuddy/sdk/models';
import { repository } from '@/__generated__/repository';
import type { CompiledRows } from '@abuddy/sdk/build';
import { ROOT_FLOW_ROLE } from '@abuddy/sdk';
import type { FlowEntity } from '@abuddy/sdk';

/**
 * Flow Repository: the flows plugin's views of flows, nodes and edges, over the SDK's flow repository
 * (`flowRepository`), which owns their reads and writes. Adds the connected data the plugin shows, a
 * flow created with its entry node, and the flows plugin's `rootFlowId` setting kept with the root role.
 */

export const FLOW_ROLES = {
  ROOT_FLOW: EARS.RoleKind.Custom(ROOT_FLOW_ROLE),
  ENTRY_EVENT: "entry_event",
} as const;

const FLOW_ENTRY_NODE = {
  TYPE: 'listener' as const,
  LABEL: 'Flow Entry',
  COLOR: '#1E88E5',
  SCOPE: 'entry' as const,
  EVENT_TYPE: 'flow.entry',
} as const;

const FLOW_QUERY_FIELDS = {
  LIST: ["id", "label", "flowType", "createdAt"] as const,
} as const;

// Queries
export const flowsQueries = {
  rootFlow: (): EARS.EntityId | undefined => flowRepository.rootFlow(),

  getNodeActionId: (nodeId: EARS.EntityId): EARS.EntityId | undefined => flowRepository.getNodeActionId(nodeId),

  // Rows as stored: the pack's step node types
  node: (nodeId: EARS.EntityId): NodeEntity | undefined => flowRepository.node(nodeId) as NodeEntity | undefined,

  flowNodes: (flowId: EARS.EntityId): NodeEntity[] => flowRepository.flowNodes(flowId) as NodeEntity[],

  flowEdges: (flowId: EARS.EntityId): EdgeEntity[] => flowRepository.flowEdges(flowId) as EdgeEntity[],

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
      .pick(FLOW_QUERY_FIELDS.LIST);

    const rootFlow = qx(EARS.Entity.Flow)
      .withRole(FLOW_ROLES.ROOT_FLOW)
      .pickOne(FLOW_QUERY_FIELDS.LIST) ?? undefined;
      
    const flowId = rootFlow?.id ?? 'Flow-1';
    const nodes = flowsQueries.flowNodes(flowId);
    const edges = flowsQueries.flowEdges(flowId);

    const selectedFlow = qx(EARS.Entity.Flow)
      .withRole(FLOW_ROLES.ROOT_FLOW)
      .pickOne(["id"]);

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
  createFlow: (flow?: Partial<FlowEntity>): FlowEntity => flowRepository.createFlow(flow),

  createFlowWithEntryNode: (flow?: Partial<FlowEntity>): { flow: FlowEntity; entryNode: NodeEntity } => {
    const newFlow = flowsCommands.createFlow(flow);
    const entryNode = flowsCommands.createNode(newFlow.id, {
      nodeType: FLOW_ENTRY_NODE.TYPE,
      label: FLOW_ENTRY_NODE.LABEL,
      color: FLOW_ENTRY_NODE.COLOR,
      scope: FLOW_ENTRY_NODE.SCOPE,
      eventType: FLOW_ENTRY_NODE.EVENT_TYPE,
    } as Partial<NodeEntity>);
    tx(entryNode.id).grant(FLOW_ROLES.ENTRY_EVENT);
    return { flow: newFlow, entryNode };
  },

  createNode: (flowId: EARS.EntityId, nodeData: NodeCreateInput): NodeEntity =>
    flowRepository.createNode(flowId, nodeData) as NodeEntity,

  createEdge: (
    sourceId: EARS.EntityId,
    targetId: EARS.EntityId,
    options?: { sourceHandle?: string; targetHandle?: string }
  ): { relId: EARS.EntityId } => flowRepository.createEdge(sourceId, targetId, options),

  updateFlowLabel: (flowId: EARS.EntityId, label: string): void => flowRepository.updateFlowLabel(flowId, label),

  updateNode: (nodeId: EARS.EntityId, updates: NodeCreateInput): void => flowRepository.updateNode(nodeId, updates),

  deleteNode: (nodeId: EARS.EntityId): void => flowRepository.deleteNode(nodeId),

  deleteEdge: (edgeId: EARS.EntityId): void => flowRepository.deleteEdge(edgeId),

  updateEdge: (
    edgeId: EARS.EntityId,
    oldSource: EARS.EntityId,
    oldTarget: EARS.EntityId,
    newSource: EARS.EntityId,
    newTarget: EARS.EntityId
  ): { newRelId: EARS.EntityId } => flowRepository.updateEdge(edgeId, oldSource, oldTarget, newSource, newTarget),

  /** Makes a flow the root flow, and records it in the flows plugin's settings */
  grantRootFlowRole: (flowId: EARS.EntityId): void => {
    flowRepository.grantRootFlowRole(flowId);
    repository.settingsCommands.updateSettings('plugin', 'flows', ['rootFlowId'], flowId);
  },

  revokeRootFlowRole: (flowId: EARS.EntityId): void => flowRepository.revokeRootFlowRole(flowId),

  deleteFlow: (flowId: EARS.EntityId, options?: { allowRoot?: boolean }): void => flowRepository.deleteFlow(flowId, options),

  reindexHandles: (nodeId: EARS.EntityId, prefix: string, pivotIndex: number, direction: 1 | -1): void =>
    flowRepository.reindexHandles(nodeId, prefix, pivotIndex, direction),

  /** Imports compiled flow DSL; a root flow among it is recorded in the flows plugin's settings too */
  importFromDSL: (compiled: CompiledRows): { flowIds: EARS.EntityId[] } => {
    const result = flowRepository.importFromDSL(compiled);
    flowsCommands.syncRootFlowSetting();
    return result;
  },

  /** Points the flows plugin's `rootFlowId` setting at the flow with the root role (the SDK's flow seeder grants it) */
  syncRootFlowSetting: (): EARS.EntityId | undefined => {
    const rootFlowId = flowRepository.rootFlow();
    if (rootFlowId && repository.settingsQueries.getPluginSettings('flows')?.rootFlowId !== rootFlowId) {
      repository.settingsCommands.updateSettings('plugin', 'flows', ['rootFlowId'], rootFlowId);
    }
    return rootFlowId;
  },
} as const;
