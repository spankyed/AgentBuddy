import { assign, log, setup, type ActorRefFrom } from 'xstate'
import breadcrumb, { breadcrumbWithParams } from '@/core/breadcrumb'
import { contextMenuFn } from '@/core/context-menu'
import { Edit, Trash2 } from 'lucide-vue-next'
import { safeEvents } from '@/core/types/safe-events'
import {
  targetIs,
  type TrailClickEvent,
} from '@/core/actors/route-trailer'
import { type NavHistory, createNavHistory, pushNavHistory, goBack, goForward, canGoBack, canGoForward } from '@/core/utils/nav-history'
import type {
  FlowEntity,
  OutgoingFlowsEvents,
  NodeEntity,
  EARS,
  EdgeEntity,
  PromptEntity,
  ModelCatalogEntry,
  ActionEntity,
  TNodeEntity,
  TrackEntity,
  OutgoingBrainEvents,
} from '@app/api'
import { trpc } from '@/core/trpc'
import { getNodeConfig, isTriggerNode } from './canvas/nodes'
import { calculateLayoutAsync, allNodesHavePositions, LAYOUT_CONFIG, layoutComponentAroundSource, type LayoutPositions } from './canvas/layout-utils'
import { computeMaxBottom, type LayoutNodeData } from './canvas/nodes/node-dimensions'

const randId = () => Math.random().toString(36).slice(2, 8)

/** Check if a source handle already has an outgoing edge (single-connection-per-handle rule).
 *  Trigger nodes (listener, schedule) are exempt — they support unlimited parallel exits. */
function isHandleOccupied(
  edges: EdgeEntity[],
  nodes: any[],
  sourceNodeId: string,
  sourceHandle?: string,
): boolean {
  const sourceNode = nodes.find((n: any) => n.id === sourceNodeId)
  if (isTriggerNode(sourceNode?.nodeType)) return false

  return edges.some(e => {
    if (e.source !== sourceNodeId) return false
    if (sourceHandle) return e.sourceHandle === sourceHandle
    return !e.sourceHandle
  })
}

/** Scan existing edges from a switch node and return the next branch index */
function nextBranchIndex(edges: EdgeEntity[], sourceNodeId: string): number {
  const indices = edges
    .filter(e => e.source === sourceNodeId && e.sourceHandle)
    .map(e => {
      const match = e.sourceHandle!.match(/branch-(\d+)/)
      return match ? parseInt(match[1], 10) : -1
    })
    .filter(i => i >= 0)
  return indices.length > 0 ? Math.max(...indices) + 1 : 0
}

/** Shift handle indices on edges when a handle is inserted or removed.
 *  direction=1 (insert): indices >= pivotIndex shift up
 *  direction=-1 (remove): indices > pivotIndex shift down */
function reindexEdges(
  edges: EdgeEntity[], nodeId: string, prefix: string,
  pivotIndex: number, direction: 1 | -1
): EdgeEntity[] {
  const pattern = new RegExp(`^${prefix}-(\\d+)$`)
  const threshold = direction === 1 ? pivotIndex : pivotIndex + 1
  return edges.map(edge => {
    if (edge.source !== nodeId || !edge.sourceHandle) return edge
    const m = edge.sourceHandle.match(pattern)
    if (!m) return edge
    const idx = parseInt(m[1], 10)
    if (idx < threshold) return edge
    return { ...edge, sourceHandle: `${prefix}-${idx + direction}` }
  })
}


const HANDLE_OCCUPIED_ERROR = 'This step already has an outbound connection'

const DEFAULT_ELSE_CONDITION = { predicate: undefined, label: 'Else' }

function applyNodeTypeDefaults(nodeData: Record<string, any>): void {
  if (nodeData.nodeType === 'switch') {
    nodeData.conditions = [{ ...DEFAULT_ELSE_CONDITION }]
  }
  if (nodeData.nodeType === 'schedule') {
    nodeData.cronExpression = '0 * * * *'
  }
}

/* ─────────────────────────────────────────────────────────── */
/* Machine Types                                               */
/* ─────────────────────────────────────────────────────────── */
export const flowsId = 'flows'
export const id = flowsId
export type FlowsState = ActorRefFrom<typeof flowsState>

export interface FlowsContext {
  selectedNodeId?: EARS.EntityId;
  editingNodeId?: EARS.EntityId; // Node currently being edited
  selectedFlowId?: EARS.EntityId;
  // Handle selection for click-to-connect workflow
  selectedHandle?: {
    nodeId: string;
    handleId?: string;
  };
  graph: {
    nodes: NodeEntity[];
    edges: EdgeEntity[];
    // Store positions separately from node data
    positions: Record<string, { x: number; y: number }>;
  };
  flows: FlowEntity[];
  // Resources available for node configuration
  prompts: PromptEntity[];
  models: ModelCatalogEntry[];
  actions: ActionEntity[];
  // Track temporary IDs during async creation
  tempIdMap: Record<string, string>; // tempId -> permanentId
  // Settings
  settings?: any; // FlowsSettings
  // Dialog bridge flags (set by context menu, consumed by watchers in flow-canvas.vue)
  showEditLabelDialog?: boolean;
  showDeleteFlowDialog?: boolean;
  canvasError?: string;
  // DSL Import state
  dslImport: {
    status: 'idle' | 'importing' | 'success' | 'error';
    errors: string[];
    importedFlowNames: string[];
  };
  // DSL Export state
  dslExport: {
    status: 'idle' | 'exporting' | 'success' | 'error';
    errors: string[];
    filePath: string;
    flowCount: number;
  };
  navHistory: NavHistory<string | null>;
}

type SystemEvent = OutgoingFlowsEvents
  | { type: 'FLOW_DELETED'; flowId: EARS.EntityId }
  | { type: 'ACTION_CREATED'; action: ActionEntity; actionId: EARS.EntityId }
  | { type: 'ACTION_UPDATED'; action: ActionEntity; actionId: EARS.EntityId }
  | { type: 'ACTION_DELETED'; actionId: EARS.EntityId }
  // DSL Import backend responses
  | { type: 'DSL_IMPORTED'; flowIds: string[] }
  | { type: 'DSL_IMPORT_FAILED'; errors: string[] }
  // DSL Export backend responses
  | { type: 'DSL_EXPORTED'; filePath: string; flowCount: number }
  | { type: 'DSL_EXPORT_FAILED'; errors: string[] }

type UIEvent =
  | { type: 'NODE.CLICK'; nodeId: string }
  | { type: 'NODE.DOUBLE_CLICK'; nodeId: string }
  | { type: 'HANDLE.SELECT'; nodeId: string; handleId?: string }
  | { type: 'HANDLE.DESELECT' }
  | { type: 'HANDLE.REINDEX'; nodeId: string; prefix: string; index: number; direction: 1 | -1 }
  | { type: 'NODE.EDITOR.CLOSE' }
  | { type: 'NODE.DELETE'; nodeId: string }
  | { type: 'NODE.SELECTION_CHANGE'; nodeId: string; selected: boolean }
  | { type: 'EDGE.CONNECT'; src: string; tgt: string; sourceHandle?: string; targetHandle?: string }
  | { type: 'EDGE.DISCONNECT'; edgeId: string }
  | { type: 'EDGE.RECONNECT'; edgeId: string; oldSource: string; oldTarget: string; newSource: string; newTarget: string }
  | { type: 'NODE.CREATE'; nodeType: string; position?: { x: number; y: number } }
  | { type: 'NODE.CREATE_CONNECTED'; nodeType: string; sourceNodeId: string; sourceHandle?: string }
  | { type: 'NODE.UPDATE'; nodeId: EARS.EntityId; updates: Partial<NodeEntity> }
  | { type: 'NODE.UPDATE_POSITION'; nodeId: string; position: { x: number; y: number } }
  | { type: 'FLOW.PREVIEW'; flowId: EARS.EntityId }
  | { type: 'FLOW.SELECT'; flowId: EARS.EntityId }
  | { type: 'SELECT_ROOT_FLOW' }
  | { type: 'SELECT_AND_EDIT_FIRST_NODE' }
  | { type: 'FLOW.CREATE'; }
  | { type: 'FLOW.DELETE'; flowId: EARS.EntityId }
  | { type: 'FLOW.UPDATE_LABEL'; flowId: EARS.EntityId; label: string }
  | { type: 'GO.BACK' }
  | { type: 'NAVIGATE_BACK' }
  | { type: 'NAVIGATE_FORWARD' }
  | { type: 'FLOWS_SETTINGS_UPDATED'; settings: any }
  // DSL Import events
  | { type: 'DSL.IMPORT'; dsl: any; flowNames: string[] }
  | { type: 'DSL.RESET_STATUS' }
  // DSL Export events
  | { type: 'DSL.EXPORT'; directory: string }
  | { type: 'DSL.RESET_EXPORT_STATUS' }
  // Context menu dialog bridge events
  | { type: 'FLOW.REQUEST_EDIT_LABEL' }
  | { type: 'FLOW.REQUEST_DELETE' }
  | { type: 'FLOW.DIALOG_CLOSED' }
  // Canvas error
  | { type: 'CANVAS.CLEAR_ERROR' }
  // Layout events
  | { type: 'LAYOUT_COMPUTED'; positions: Record<string, { x: number; y: number }> }

export type FlowsEvents = UIEvent | SystemEvent | TrailClickEvent
const typeOf = safeEvents<FlowsEvents>()

const flowsState = setup({
  types: {
    context: {} as FlowsContext,
    events: {} as FlowsEvents,
  },
  actions: {
    /* ── bootstrap ─────────────────────────────────────── */
    setPluginData: assign(({ context, event, self }) => {
      const ev = typeOf('FLOWS_CONNECTED', event);

      const existingPositions = context.graph?.positions || {};
      const graphNodes = ev.data.graph?.nodes || [];
      const graphEdges = ev.data.graph?.edges || [];
      const needsLayout = graphNodes.length > 0 && !allNodesHavePositions(graphNodes, existingPositions);

      // Trigger async layout calculation if needed
      if (needsLayout) {
        calculateLayoutAsync({ nodes: graphNodes, edges: graphEdges })
          .then((positions) => {
            self.send({ type: 'LAYOUT_COMPUTED', positions })
          })
      }

      return {
        flows: (ev.data.flows || []) as FlowEntity[],
        prompts: ev.data.prompts || [],
        models: ev.data.models || [],
        actions: ev.data.actions || [],
        selectedFlowId: ev.data.selectedFlowId,
        graph: {
          nodes: graphNodes,
          edges: graphEdges,
          positions: needsLayout ? {} : existingPositions,
        },
        settings: ev.data.settings || {},
      }
    }),
    
    handleSettingsUpdate: assign(({ event }) => {
      const ev = typeOf('FLOWS_SETTINGS_UPDATED', event);
      return {
        settings: ev.settings || {},
      };
    }),



    /* ── flow interactions ────────────────────────────── */
    selectFlow: ({ event, context }) => {
      const ev = typeOf(['FLOW.SELECT', 'FLOW.PREVIEW', 'FLOW_CREATED'], event);
      if (context.selectedFlowId === ev.flowId) {
        return
      }
      // Send event to backend to get flow data
      trpc.bus.send.mutate({
        systemId: id,
        type: 'FLOW_SELECT',
        flowId: ev.flowId,
      });
    },

    selectRootFlow: ({ context }) => {
      const rootFlowId = context.settings?.rootFlowId;
      if (!rootFlowId) {
        console.warn('No root flow configured');
        return;
      }
      if (context.selectedFlowId === rootFlowId) {
        return;
      }
      // Send event to backend to get root flow data
      trpc.bus.send.mutate({
        systemId: id,
        type: 'FLOW_SELECT',
        flowId: rootFlowId,
      });
    },

    loadFlowData: assign(({ context, event, self }) => {
      const ev = typeOf('FLOW_SELECTED', event);

      const existingPositions = context.graph?.positions || {};
      const needsLayout = !allNodesHavePositions(ev.data.nodes, existingPositions);

      // Trigger async layout calculation if needed
      if (needsLayout) {
        calculateLayoutAsync({ nodes: ev.data.nodes, edges: ev.data.edges })
          .then((positions) => {
            self.send({ type: 'LAYOUT_COMPUTED', positions })
          })
      }

      return {
        selectedFlowId: ev.flowId,
        selectedNodeId: undefined,
        graph: {
          nodes: ev.data.nodes,
          edges: ev.data.edges,
          positions: needsLayout ? {} : existingPositions,
        },
        navHistory: pushNavHistory(context.navHistory, ev.flowId as string),
      };
    }),

    sendCreateFlow: ({ event }) => {
      const ev = typeOf('FLOW.CREATE', event);
      trpc.bus.send.mutate({ systemId: id, type: 'CREATE_FLOW' });
    },

    sendUpdateLabel: ({ event }) => {
      const ev = typeOf('FLOW.UPDATE_LABEL', event);
      trpc.bus.send.mutate({
        systemId: id,
        type: 'UPDATE_FLOW_LABEL',
        flowId: ev.flowId,
        label: ev.label,
      });
    },

    updateFlowLabel: assign(({ context, event }) => {
      const ev = typeOf('FLOW.UPDATE_LABEL', event);
      
      // Update flow in flows list
      return {
        flows: context.flows.map(flow => 
          flow.id === ev.flowId ? { ...flow, label: ev.label } : flow
        )
      };
    }),

    addCreatedFlow: assign(({ context, event, self }) => {
      const ev = typeOf('FLOW_CREATED', event);

      // Trigger async layout calculation for new flow
      calculateLayoutAsync({
        nodes: ev.data.nodes,
        edges: ev.data.edges,
      }).then((positions) => {
        self.send({ type: 'LAYOUT_COMPUTED', positions })
      })

      return {
        flows: [...context.flows, ev.flow],
        selectedFlowId: ev.flowId,
        graph: {
          nodes: ev.data.nodes,
          edges: ev.data.edges,
          positions: {},
        },
      };
    }),

    sendDeleteFlow: ({ event }) => {
      const ev = event as { type: 'FLOW.DELETE'; flowId: EARS.EntityId };
      if (ev.type !== 'FLOW.DELETE') return;

      trpc.bus.send.mutate({
        systemId: id,
        type: 'DELETE_FLOW',
        flowId: ev.flowId as string
      });
    },

    handleFlowDeleted: assign(({ context, event }) => {
      const ev = typeOf('FLOW_DELETED', event);

      // Remove the deleted flow from the flows list
      const updatedFlows = context.flows.filter(flow => flow.id !== ev.flowId);

      // If the deleted flow was selected, clear selection and go back to list
      const wasSelected = context.selectedFlowId === ev.flowId;

      return {
        flows: updatedFlows,
        selectedFlowId: wasSelected ? undefined : context.selectedFlowId,
        graph: wasSelected ? { nodes: [], edges: [], positions: {} } : context.graph,
      };
    }),

    /* ── action interactions ──────────────────────────────── */
    addCreatedAction: assign(({ context, event }) => ({
      actions: [...context.actions, typeOf('ACTION_CREATED', event).action],
    })),

    updateActionInList: assign(({ context, event }) => {
      const ev = typeOf('ACTION_UPDATED', event);
      return {
        actions: context.actions.map(a => a.id === ev.actionId ? ev.action : a),
      };
    }),

    removeDeletedAction: assign(({ context, event }) => ({
      actions: context.actions.filter(a => a.id !== typeOf('ACTION_DELETED', event).actionId),
    })),

    /* ── graph interactions ───────────────────────────────── */
    selectNode: assign({ selectedNodeId: ({ event }) => typeOf('NODE.CLICK', event).nodeId as EARS.EntityId }),
    handleSelectionChange: assign(({ event }) => {
      const ev = typeOf('NODE.SELECTION_CHANGE', event);
      if (ev.selected && ev.nodeId) {
        return { selectedNodeId: ev.nodeId as EARS.EntityId };
      } else {
        return { selectedNodeId: undefined };
      }
    }),
    editNode: assign({ editingNodeId: ({ event }) => typeOf('NODE.DOUBLE_CLICK', event).nodeId as EARS.EntityId }),
    closeNodeEditor: assign({ editingNodeId: undefined }),
    
    selectAndEditFirstNode: assign(({ context }) => {
      // Get the first node from the current flow
      const firstNode = context.graph.nodes[0];
      if (!firstNode) {
        console.warn('No nodes available to edit');
        return {};
      }
      
      // Return both selected and editing node IDs
      return {
        selectedNodeId: firstNode.id as EARS.EntityId,
        editingNodeId: firstNode.id as EARS.EntityId
      };
    }),
    connectEdge: assign(({ context, event }) => {
      const ev = typeOf('EDGE.CONNECT', event)
      // Guard: self-connection
      if (ev.src === ev.tgt) return {}
      // Guard: duplicate edge
      const alreadyConnected = context.graph.edges.some(
        (e) => e.source === ev.src && e.target === ev.tgt
      )
      if (alreadyConnected) return {}
      // Guard: target is a trigger node (no inputs)
      const targetNode = context.graph.nodes.find(n => n.id === ev.tgt)
      if (isTriggerNode(targetNode?.nodeType)) return {}
      // Guard: source handle already occupied (except listeners)
      if (isHandleOccupied(context.graph.edges, context.graph.nodes, ev.src, ev.sourceHandle)) return { canvasError: HANDLE_OCCUPIED_ERROR }
      const id = `Edge-${randId()}`
      const newEdge = {
        id,
        source: ev.src,
        target: ev.tgt,
        kind: 'transitions_to',
        // Store handle info for switch nodes with multiple outputs
        sourceHandle: ev.sourceHandle,
        targetHandle: ev.targetHandle,
      } as EdgeEntity

      return {
        graph: {
          ...context.graph,
          edges: [...context.graph.edges, newEdge],
        },
      }
    }),
    
    sendEdgeConnected: ({ context, event }) => {
      const ev = typeOf('EDGE.CONNECT', event);
      if (!context.selectedFlowId) return;

      // Only send if both IDs are permanent (not temporary)
      if (!ev.src.startsWith('temp-') && !ev.tgt.startsWith('temp-')) {
        trpc.bus.send.mutate({
          systemId: id,
          type: 'CREATE_EDGE',
          flowId: context.selectedFlowId,
          sourceId: ev.src,
          targetId: ev.tgt,
          sourceHandle: ev.sourceHandle,
          targetHandle: ev.targetHandle,
        });
      } else {
        console.log('Cannot create edge yet - nodes still pending:', { src: ev.src, tgt: ev.tgt });
      }
    },
    
    disconnectEdge: assign(({ context, event }) => {
      const ev = typeOf('EDGE.DISCONNECT', event);
      
      return { 
        graph: {
          ...context.graph,
          edges: context.graph.edges.filter(edge => edge.id !== ev.edgeId),
        },
      }
    }),
    
    sendEdgeDisconnected: ({ context, event }) => {
      const ev = typeOf('EDGE.DISCONNECT', event);
      if (!context.selectedFlowId) return;
      
      trpc.bus.send.mutate({
        systemId: id,
        type: 'DELETE_EDGE',
        flowId: context.selectedFlowId,
        edgeId: ev.edgeId,
      });
    },
    
    reconnectEdge: assign(({ context, event }) => {
      const ev = typeOf('EDGE.RECONNECT', event);
      
      // Update the edge with new source and target
      const updatedEdges = context.graph.edges.map(edge => {
        if (edge.id === ev.edgeId) {
          return { 
            ...edge, 
            source: ev.newSource as EARS.EntityId, 
            target: ev.newTarget as EARS.EntityId 
          };
        }
        return edge;
      });
      
      return {
        graph: {
          ...context.graph,
          edges: updatedEdges,
        },
      };
    }),
    
    sendEdgeReconnected: ({ context, event }) => {
      const ev = typeOf('EDGE.RECONNECT', event);
      if (!context.selectedFlowId) return;
      
      // Send update edge event to backend
      trpc.bus.send.mutate({
        systemId: id,
        type: 'UPDATE_EDGE',
        flowId: context.selectedFlowId,
        edgeId: ev.edgeId,
        oldSource: ev.oldSource,
        oldTarget: ev.oldTarget,
        newSource: ev.newSource,
        newTarget: ev.newTarget,
      });
    },
    
    deselectNode: assign({ selectedNodeId: undefined, editingNodeId: undefined }),

    // Handle selection for click-to-connect
    selectHandle: assign(({ event }) => {
      const ev = typeOf('HANDLE.SELECT', event);
      return {
        selectedHandle: {
          nodeId: ev.nodeId,
          handleId: ev.handleId,
        },
      };
    }),

    deselectHandle: assign({ selectedHandle: undefined }),
    clearCanvasError: assign({ canvasError: undefined }),
    surfaceEdgeError: assign(({ event }) => {
      const ev = typeOf('EDGE_CREATE_FAILED', event)
      return { canvasError: ev.error }
    }),

    reindexHandles: assign(({ context, event }) => {
      const ev = typeOf('HANDLE.REINDEX', event)
      const updatedEdges = reindexEdges(
        context.graph.edges, ev.nodeId, ev.prefix, ev.index, ev.direction
      )
      return { graph: { ...context.graph, edges: updatedEdges } }
    }),

    sendReindexHandles: ({ context, event }) => {
      const ev = typeOf('HANDLE.REINDEX', event)
      if (!context.selectedFlowId) return
      const nodeId = ev.nodeId.startsWith('temp-')
        ? context.tempIdMap[ev.nodeId] || ev.nodeId
        : ev.nodeId
      if (nodeId.startsWith('temp-')) return

      trpc.bus.send.mutate({
        systemId: id,
        type: 'REINDEX_HANDLES',
        flowId: context.selectedFlowId,
        nodeId,
        prefix: ev.prefix,
        index: ev.index,
        direction: ev.direction,
      })
    },

    // Connect from selected handle to clicked node and send to backend
    // Combined into single action to ensure handle is captured before being cleared
    connectFromHandleAndSend: assign(({ context, event }) => {
      const ev = typeOf('NODE.CLICK', event);
      const handle = context.selectedHandle;
      if (!handle) return { selectedNodeId: ev.nodeId as EARS.EntityId, selectedHandle: undefined };

      // Don't connect to self — select the node and clear handle instead
      if (handle.nodeId === ev.nodeId) return { selectedNodeId: ev.nodeId as EARS.EntityId, selectedHandle: undefined };

      // Don't create duplicate edge to an already-connected target
      const alreadyConnected = context.graph.edges.some(
        (e) => e.source === handle.nodeId && e.target === ev.nodeId
      );
      if (alreadyConnected) return { selectedNodeId: ev.nodeId as EARS.EntityId, selectedHandle: undefined };

      // Don't connect to trigger nodes (no inputs)
      const clickedNode = context.graph.nodes.find(n => n.id === ev.nodeId);
      if (isTriggerNode(clickedNode?.nodeType)) return { selectedNodeId: ev.nodeId as EARS.EntityId, selectedHandle: undefined };

      // Don't connect if source handle already has an outgoing edge (except listeners)
      if (isHandleOccupied(context.graph.edges, context.graph.nodes, handle.nodeId, handle.handleId)) {
        return { selectedNodeId: ev.nodeId as EARS.EntityId, selectedHandle: undefined, canvasError: HANDLE_OCCUPIED_ERROR };
      }

      const edgeId = `Edge-${randId()}`;
      const newEdge = {
        id: edgeId,
        source: handle.nodeId,
        target: ev.nodeId,
        kind: 'transitions_to',
        sourceHandle: handle.handleId,
      } as EdgeEntity;

      // Send to backend (handle is still available here, before we clear it)
      if (context.selectedFlowId &&
          !handle.nodeId.startsWith('temp-') &&
          !ev.nodeId.startsWith('temp-')) {
        trpc.bus.send.mutate({
          systemId: id,
          type: 'CREATE_EDGE',
          flowId: context.selectedFlowId,
          sourceId: handle.nodeId,
          targetId: ev.nodeId,
          sourceHandle: handle.handleId,
        });
      }

      return {
        graph: {
          ...context.graph,
          edges: [...context.graph.edges, newEdge],
        },
        selectedHandle: undefined, // Clear selection after connecting
      };
    }),

    deleteNode: assign(({ context, event }) => {
      const ev = typeOf('NODE.DELETE', event);
      const nodeId = ev.nodeId;
      
      // Remove the node from the graph
      const updatedNodes = context.graph.nodes.filter(n => n.id !== nodeId);
      
      // Also remove any edges connected to this node
      const updatedEdges = context.graph.edges.filter(edge => 
        edge.source !== nodeId && edge.target !== nodeId
      );
      
      // Clear selection if the deleted node was selected or being edited
      const newSelectedNodeId = context.selectedNodeId === nodeId ? undefined : context.selectedNodeId;
      const newEditingNodeId = context.editingNodeId === nodeId ? undefined : context.editingNodeId;
      
      return {
        graph: {
          ...context.graph,
          nodes: updatedNodes,
          edges: updatedEdges,
        },
        selectedNodeId: newSelectedNodeId,
        editingNodeId: newEditingNodeId,
      };
    }),
    
    sendNodeDeleted: ({ context, event }) => {
      const ev = typeOf('NODE.DELETE', event);
      if (!context.selectedFlowId) return;
      
      trpc.bus.send.mutate({
        systemId: id,
        type: 'DELETE_NODE',
        flowId: context.selectedFlowId,
        nodeId: ev.nodeId,
      });
    },

    createNode: assign(({ context, event, self }) => {
      if (!context.selectedFlowId) return { selectedNodeId: undefined }

      const tempId = `temp-${randId()}`
      const ev = typeOf('NODE.CREATE', event)
      const nodeConfig = getNodeConfig(ev.nodeType)
      const label = nodeConfig?.defaultLabel || nodeConfig?.label || `New ${ev.nodeType}`

      trpc.bus.send.mutate({
        systemId: id,
        type: 'CREATE_NODE',
        flowId: context.selectedFlowId,
        tempId,
        nodeData: { nodeType: ev.nodeType, label },
      });

      // Calculate position based on node type and selection state
      const { newNode: nodeOffset } = LAYOUT_CONFIG
      const positions = context.graph.positions
      const allPos = Object.values(positions)
      const isListener = nodeConfig?.connectionRules.inputs === 0

      // "Below all nodes" position for new tracks or unconnected steps
      // Compute the actual bottom of all nodes (accounting for dynamic heights like multi-exit listeners)
      const maxBottom = allPos.length > 0
        ? computeMaxBottom(context.graph.nodes as LayoutNodeData[], positions, context.graph.edges)
        : 0

      // Use the x-position of an existing trigger node so the new node aligns with
      // ELK-laid-out tracks (ELK may add internal padding, so x is often non-zero).
      const existingListenerX = context.graph.nodes
        .find(n => isTriggerNode(n.nodeType) && positions[n.id])
      const alignX = existingListenerX ? positions[existingListenerX.id].x : 0

      const belowAllPos = maxBottom > 0
        ? { x: alignX, y: maxBottom + LAYOUT_CONFIG.chainGap }
        : { x: nodeOffset.defaultX, y: nodeOffset.defaultY }

      let newPosition: { x: number; y: number }
      let autoEdge: EdgeEntity | null = null
      let handleBlocked = false

      if (ev.position) {
        // Drag-drop: use explicit position
        newPosition = ev.position
      } else if (isListener) {
        // Listeners start new tracks — always place below
        newPosition = belowAllPos
      } else if (context.selectedNodeId && positions[context.selectedNodeId]) {
        // Step with selected node — place to the right and auto-connect
        const selectedPos = positions[context.selectedNodeId]
        newPosition = { x: selectedPos.x + nodeOffset.xOffset, y: selectedPos.y + nodeOffset.yOffset }

        // Auto-create edge unless selected node has no outputs (fire/kill)
        const selectedNode = context.graph.nodes.find(n => n.id === context.selectedNodeId)
        const selectedConfig = selectedNode ? getNodeConfig(selectedNode.nodeType) : null
        if (selectedConfig?.connectionRules.outputs !== 0) {
          // For listeners, assign the next available exit handle
          let sourceHandle: string | undefined
          if (selectedConfig?.connectionRules.inputs === 0) {
            const existingExits = context.graph.edges
              .filter(e => e.source === context.selectedNodeId && e.sourceHandle)
              .map(e => {
                const match = e.sourceHandle!.match(/exit-(\d+)/)
                return match ? parseInt(match[1], 10) : -1
              })
            const nextIndex = existingExits.length > 0 ? Math.max(...existingExits) + 1 : 0
            sourceHandle = `exit-${nextIndex}`
          } else if (selectedNode?.nodeType === 'switch') {
            sourceHandle = `branch-${nextBranchIndex(context.graph.edges, context.selectedNodeId!)}`
          }

          // Only auto-connect if handle is not already occupied
          if (!isHandleOccupied(context.graph.edges, context.graph.nodes, context.selectedNodeId!, sourceHandle)) {
            const tempEdgeId = `Edge-${randId()}`
            autoEdge = {
              id: tempEdgeId,
              source: context.selectedNodeId,
              target: tempId,
              kind: 'transitions_to',
              ...(sourceHandle && { sourceHandle }),
            } as EdgeEntity
          } else {
            // Handle occupied — skip auto-connect, place below instead
            handleBlocked = true
            newPosition = belowAllPos
          }
        }
      } else {
        // Step with no selection — place below all nodes
        newPosition = belowAllPos
      }

      const tempNodeData: any = { id: tempId, nodeType: ev.nodeType, label, flowId: context.selectedFlowId, configuration: {} }
      applyNodeTypeDefaults(tempNodeData)

      // Async ELK layout to snap the new node and reposition siblings in the same component
      if (autoEdge && context.selectedNodeId) {
        layoutComponentAroundSource(
          context.selectedNodeId,
          [...context.graph.nodes, tempNodeData],
          [...context.graph.edges, autoEdge],
          positions,
          (nodeId, position) => self.send({ type: 'NODE.UPDATE_POSITION', nodeId, position })
        )
      }

      return {
        graph: {
          ...context.graph,
          nodes: [...context.graph.nodes, tempNodeData],
          edges: autoEdge ? [...context.graph.edges, autoEdge] : context.graph.edges,
          positions: { ...positions, [tempId]: newPosition },
        },
        selectedNodeId: tempId as EARS.EntityId,
        tempIdMap: { ...context.tempIdMap, [tempId]: tempId },
        canvasError: handleBlocked ? HANDLE_OCCUPIED_ERROR : undefined,
      }
    }),

    createConnectedNode: assign(({ context, event, self }) => {
      if (!context.selectedFlowId) {
        return { selectedNodeId: undefined }
      }

      const tempId = `temp-${randId()}`
      const ev = typeOf('NODE.CREATE_CONNECTED', event)

      // Get the default label from node config
      const nodeConfig = getNodeConfig(ev.nodeType)
      const defaultLabel = nodeConfig?.defaultLabel || nodeConfig?.label || `New ${ev.nodeType}`

      const newNode: any = {
        id: tempId,
        nodeType: ev.nodeType,
        label: defaultLabel,
        flowId: context.selectedFlowId,
        configuration: {},
      }
      applyNodeTypeDefaults(newNode)

      // Calculate position: to the right of the source node
      const { newNode: nodeOffset } = LAYOUT_CONFIG
      const positions = context.graph.positions
      const sourcePos = positions[ev.sourceNodeId]
      const newPosition = sourcePos
        ? { x: sourcePos.x + nodeOffset.xOffset, y: sourcePos.y + nodeOffset.yOffset }
        : { x: nodeOffset.fallbackX, y: nodeOffset.fallbackY }

      // Resolve sourceHandle — fallback to next handle index for multi-exit nodes
      let resolvedSourceHandle = ev.sourceHandle
      if (!resolvedSourceHandle) {
        const sourceNode = context.graph.nodes.find(n => n.id === ev.sourceNodeId)
        if (sourceNode?.nodeType === 'switch') {
          resolvedSourceHandle = `branch-${nextBranchIndex(context.graph.edges, ev.sourceNodeId)}`
        } else if (isTriggerNode(sourceNode?.nodeType)) {
          const existingExits = context.graph.edges
            .filter(e => e.source === ev.sourceNodeId && e.sourceHandle)
            .map(e => {
              const match = e.sourceHandle!.match(/exit-(\d+)/)
              return match ? parseInt(match[1], 10) : -1
            })
          const nextIndex = existingExits.length > 0 ? Math.max(...existingExits) + 1 : 0
          resolvedSourceHandle = `exit-${nextIndex}`
        }
      }

      // Don't connect if source handle already occupied (except listeners)
      if (isHandleOccupied(context.graph.edges, context.graph.nodes, ev.sourceNodeId, resolvedSourceHandle)) {
        return { canvasError: HANDLE_OCCUPIED_ERROR }
      }

      // Create temporary edge
      const tempEdgeId = `Edge-${randId()}`
      const tempEdge: EdgeEntity = {
        id: tempEdgeId,
        source: ev.sourceNodeId,
        target: tempId,
        kind: 'transitions_to',
        sourceHandle: resolvedSourceHandle,
      } as EdgeEntity

      // Send create to backend
      trpc.bus.send.mutate({
        systemId: id,
        type: 'CREATE_NODE',
        flowId: context.selectedFlowId,
        tempId: tempId,
        nodeData: {
          nodeType: ev.nodeType,
          label: newNode.label,
        },
      });

      // Async ELK layout to snap the new node and reposition siblings in the same component
      layoutComponentAroundSource(
        ev.sourceNodeId,
        [...context.graph.nodes, newNode],
        [...context.graph.edges, tempEdge],
        positions,
        (nodeId, position) => self.send({ type: 'NODE.UPDATE_POSITION', nodeId, position })
      )

      return {
        graph: {
          ...context.graph,
          nodes: [...context.graph.nodes, newNode],
          edges: [...context.graph.edges, tempEdge],
          positions: { ...positions, [tempId]: newPosition },
        },
        selectedNodeId: tempId as EARS.EntityId,
        editingNodeId: tempId as EARS.EntityId,
        tempIdMap: {
          ...context.tempIdMap,
          [tempId]: tempId,
        }
      }
    }),

    /* ── node update actions ──────────────────────────────── */
    updateNode: assign(({ context, event }) => {
      const ev = typeOf('NODE.UPDATE', event);
      return {
        graph: {
          ...context.graph,
          nodes: context.graph.nodes.map((node) =>
            node.id === ev.nodeId ? { ...node, ...ev.updates } : node
          ) as any[], // Temporary fix for mixed node types
        },
      };
    }),

    sendNodeUpdate: ({ context, event }) => {
      const ev = typeOf('NODE.UPDATE', event);
      if (!context.selectedFlowId) return;
      
      // Check if this is a temporary ID
      const nodeId = ev.nodeId.startsWith('temp-') 
        ? context.tempIdMap[ev.nodeId] || ev.nodeId
        : ev.nodeId;
      
      // If it's still temporary (not yet resolved), skip the update
      if (nodeId.startsWith('temp-')) {
        console.warn('Cannot update node with temporary ID:', nodeId);
        return;
      }
      
      const node = context.graph.nodes.find(n => n.id === nodeId);
      if (!node) return;

      // Send update to backend
      trpc.bus.send.mutate({
        systemId: id,
        type: 'UPDATE_NODE',
        flowId: context.selectedFlowId,
        nodeId: nodeId,
        nodeData: { ...node, ...ev.updates },
      });
    },

    updateNodePosition: assign(({ context, event }) => {
      const ev = typeOf('NODE.UPDATE_POSITION', event);
      const nodeId = ev.nodeId;
      
      // Check if we need to use the permanent ID from tempIdMap
      const permanentId = nodeId.startsWith('temp-') 
        ? context.tempIdMap[nodeId] || nodeId
        : nodeId;
      
      return {
        graph: {
          ...context.graph,
          positions: {
            ...context.graph.positions,
            // Use the permanent ID for position storage if available
            [permanentId]: { x: ev.position.x, y: ev.position.y }
          }
        },
      };
    }),

    /* ── ID reconciliation actions ────────────────────────── */
    reconcileNodeId: assign(({ context, event }) => {
      const ev = typeOf('NODE_CREATED', event);
      const { tempId, nodeId: permanentId, node } = ev;
      
      // The node from backend already has the permanent ID, just replace the temp node
      const updatedNodes = context.graph.nodes.map(n => 
        n.id === tempId ? node : n
      );
      
      // Update selected node ID if it was the temp one
      const newSelectedNodeId = context.selectedNodeId === tempId 
        ? permanentId 
        : context.selectedNodeId;
      
      // Update editing node ID if it was the temp one
      const newEditingNodeId = context.editingNodeId === tempId
        ? permanentId
        : context.editingNodeId;
      
      // Update edges that reference the temporary ID
      const updatedEdges = context.graph.edges.map(edge => ({
        ...edge,
        source: edge.source === tempId ? permanentId : edge.source,
        target: edge.target === tempId ? permanentId : edge.target,
      }));
      
      // Update positions if needed
      const updatedPositions = { ...context.graph.positions };
      if (updatedPositions[tempId]) {
        updatedPositions[permanentId] = updatedPositions[tempId];
        delete updatedPositions[tempId];
      }
      
      // Update tempIdMap
      const updatedTempIdMap = { ...context.tempIdMap };
      updatedTempIdMap[tempId] = permanentId;
      
      // Send edge creation to backend for any edges with the new permanent ID
      if (context.selectedFlowId) {
        updatedEdges.forEach(edge => {
          // If this edge was just updated from temp to permanent, send it
          const wasUpdated = (edge.source === permanentId && context.graph.edges.find(e => e.id === edge.id)?.source === tempId)
            || (edge.target === permanentId && context.graph.edges.find(e => e.id === edge.id)?.target === tempId);
          
          if (wasUpdated && !edge.source.startsWith('temp-') && !edge.target.startsWith('temp-')) {
            trpc.bus.send.mutate({
              systemId: id,
              type: 'CREATE_EDGE',
              flowId: context.selectedFlowId!,
              sourceId: edge.source,
              targetId: edge.target,
              sourceHandle: edge.sourceHandle,
              targetHandle: edge.targetHandle,
            });
          }
        });
      }
      
      return {
        graph: {
          nodes: updatedNodes,
          edges: updatedEdges,
          positions: updatedPositions,
        },
        selectedNodeId: newSelectedNodeId,
        editingNodeId: newEditingNodeId,
        tempIdMap: updatedTempIdMap,
      };
    }),
    
    /* ── Edge ID reconciliation ────────────────────────────── */
    reconcileEdgeId: assign(({ context, event }) => {
      const ev = typeOf('EDGE_CREATED', event);
      const { sourceId, targetId, relId, sourceHandle, targetHandle } = ev;

      // Find the edge with matching source, target, and handles
      const updatedEdges = context.graph.edges.map(edge => {
        const sourceMatches = edge.source === sourceId;
        const targetMatches = edge.target === targetId;
        // For switch nodes, also match by handle to differentiate branches
        // Normalize null/undefined to avoid mismatches
        const sourceHandleMatches = (sourceHandle || null) === (edge.sourceHandle || null);
        const targetHandleMatches = (targetHandle || null) === (edge.targetHandle || null);

        if (sourceMatches && targetMatches && sourceHandleMatches && targetHandleMatches) {
          // Update the edge ID to the real relation ID
          return { ...edge, id: relId as EARS.EntityId };
        }
        return edge;
      });

      return {
        graph: {
          ...context.graph,
          edges: updatedEdges,
        },
      };
    }),
    
    reconcileUpdatedEdgeId: assign(({ context, event }) => {
      const ev = typeOf('EDGE_UPDATED', event);
      const { oldEdgeId, newEdgeId, newSource, newTarget } = ev;
      
      // Update the edge with the old ID to have the new ID and connections
      const updatedEdges = context.graph.edges.map(edge => {
        if (edge.id === oldEdgeId) {
          return { 
            ...edge, 
            id: newEdgeId,
            source: newSource,
            target: newTarget
          };
        }
        return edge;
      });
      
      return {
        graph: {
          ...context.graph,
          edges: updatedEdges,
        },
      };
    }),
    
    removeDeletedEdge: assign(({ context, event }) => {
      const ev = typeOf('EDGE_DELETED', event);
      const { edgeId } = ev;

      // Remove the edge from the graph
      const updatedEdges = context.graph.edges.filter(edge => edge.id !== edgeId);

      return {
        graph: {
          ...context.graph,
          edges: updatedEdges,
        },
      };
    }),

    /* ── DSL Import actions ────────────────────────────────── */
    setImporting: assign(({ context }) => ({
      dslImport: {
        ...context.dslImport,
        status: 'importing' as const,
      },
    })),

    sendImportDSL: ({ event }) => {
      const ev = typeOf('DSL.IMPORT', event);
      trpc.bus.send.mutate({
        systemId: id,
        type: 'IMPORT_DSL',
        dsl: ev.dsl,
      } as any);
    },

    handleDSLImported: assign(({ context, event }) => {
      const ev = typeOf('DSL_IMPORTED', event);
      return {
        dslImport: {
          status: 'success' as const,
          errors: [],
          importedFlowNames: context.dslImport.importedFlowNames, // Keep the names we parsed from file
        },
      };
    }),

    handleDSLImportFailed: assign(({ event }) => {
      const ev = typeOf('DSL_IMPORT_FAILED', event);
      return {
        dslImport: {
          status: 'error' as const,
          errors: ev.errors,
          importedFlowNames: [],
        },
      };
    }),

    setFlowNamesFromDSL: assign(({ context, event }) => {
      const ev = typeOf('DSL.IMPORT', event);
      return {
        dslImport: {
          ...context.dslImport,
          importedFlowNames: ev.flowNames,
        },
      };
    }),

    resetImportStatus: assign({
      dslImport: { status: 'idle' as const, errors: [], importedFlowNames: [] },
    }),

    /* ── DSL Export actions ────────────────────────────────── */
    setExporting: assign(({ context }) => ({
      dslExport: {
        ...context.dslExport,
        status: 'exporting' as const,
      },
    })),

    sendExportDSL: ({ event }) => {
      const ev = typeOf('DSL.EXPORT', event);
      trpc.bus.send.mutate({
        systemId: id,
        type: 'EXPORT_DSL',
        directory: ev.directory,
      } as any);
    },

    handleDSLExported: assign(({ event }) => {
      const ev = typeOf('DSL_EXPORTED', event);
      return {
        dslExport: {
          status: 'success' as const,
          errors: [],
          filePath: ev.filePath,
          flowCount: ev.flowCount,
        },
      };
    }),

    handleDSLExportFailed: assign(({ event }) => {
      const ev = typeOf('DSL_EXPORT_FAILED', event);
      return {
        dslExport: {
          status: 'error' as const,
          errors: ev.errors,
          filePath: '',
          flowCount: 0,
        },
      };
    }),

    resetExportStatus: assign({
      dslExport: { status: 'idle' as const, errors: [], filePath: '', flowCount: 0 },
    }),

    /* ── Context menu dialog bridge actions ───────────────── */
    requestEditLabel: assign({ showEditLabelDialog: true }),
    requestDeleteFlow: assign({ showDeleteFlowDialog: true }),
    closeDialogs: assign({ showEditLabelDialog: false, showDeleteFlowDialog: false }),
  },
  guards: {
    targetIs,
    isDeletedFlowSelected: ({ context, event }) => {
      const ev = typeOf('FLOW_DELETED', event);
      return context.selectedFlowId === ev.flowId;
    },
    hasSelectedHandle: ({ context }) => !!context.selectedHandle,
  },
}).createMachine({
  id,
  initial: 'list',
  context: {
    selectedNodeId: undefined,
    editingNodeId: undefined,
    selectedFlowId: undefined,
    graph: {
      nodes: [],
      edges: [],
      positions: {},
    },
    flows: [],
    prompts: [],
    models: [],
    actions: [],
    tempIdMap: {},
    dslImport: {
      status: 'idle',
      errors: [],
      importedFlowNames: [],
    },
    dslExport: {
      status: 'idle',
      errors: [],
      filePath: '',
      flowCount: 0,
    },
    navHistory: createNavHistory<string | null>(null),
  },
  on: {
    FLOWS_CONNECTED: {
      actions: 'setPluginData',
      // target: '.view' // Go directly to view since we have the selected flow's data
    },
    FLOWS_SETTINGS_UPDATED: {
      actions: 'handleSettingsUpdate'
    },
    FLOW_SELECTED: { actions: 'loadFlowData' },
    LAYOUT_COMPUTED: {
      actions: assign(({ context, event }) => {
        const ev = event as { type: 'LAYOUT_COMPUTED'; positions: Record<string, { x: number; y: number }> }
        return {
          graph: {
            ...context.graph,
            positions: ev.positions,
          },
        }
      }),
    },
    FLOW_CREATED: {
      actions: 'addCreatedFlow',
      target: '.view'
    },
    FLOW_DELETED: [
      {
        guard: 'isDeletedFlowSelected',
        target: '.list',
        actions: 'handleFlowDeleted',
      },
      {
        actions: 'handleFlowDeleted',
      }
    ],
    NODE_CREATED: {
      actions: 'reconcileNodeId'
    },
    EDGE_CREATED: {
      actions: 'reconcileEdgeId'
    },
    EDGE_CREATE_FAILED: {
      actions: 'surfaceEdgeError',
    },
    'CANVAS.CLEAR_ERROR': {
      actions: 'clearCanvasError',
    },
    EDGE_UPDATED: {
      actions: 'reconcileUpdatedEdgeId'
    },
    EDGE_DELETED: {
      actions: 'removeDeletedEdge'
    },
    NODE_DELETED: {
      // Backend confirmation - node already removed locally
    },
    ACTION_CREATED: {
      actions: 'addCreatedAction'
    },
    ACTION_UPDATED: {
      actions: 'updateActionInList'
    },
    ACTION_DELETED: {
      actions: 'removeDeletedAction'
    },
    // DSL Import events
    'DSL.IMPORT': {
      actions: ['setFlowNamesFromDSL', 'setImporting', 'sendImportDSL']
    },
    'DSL.RESET_STATUS': {
      actions: 'resetImportStatus'
    },
    DSL_IMPORTED: {
      actions: 'handleDSLImported'
    },
    DSL_IMPORT_FAILED: {
      actions: 'handleDSLImportFailed'
    },
    // DSL Export events
    'DSL.EXPORT': {
      actions: ['setExporting', 'sendExportDSL']
    },
    'DSL.RESET_EXPORT_STATUS': {
      actions: 'resetExportStatus'
    },
    DSL_EXPORTED: {
      actions: 'handleDSLExported'
    },
    DSL_EXPORT_FAILED: {
      actions: 'handleDSLExportFailed'
    },
    NAVIGATE_BACK: [
      {
        guard: ({ context }) => {
          if (!canGoBack(context.navHistory)) return false;
          return context.navHistory.stack[context.navHistory.index - 1] === null;
        },
        target: '.list',
        actions: assign(({ context }) => {
          const result = goBack(context.navHistory)!;
          return { navHistory: result.history, selectedFlowId: undefined };
        }),
      },
      {
        guard: ({ context }) => {
          if (!canGoBack(context.navHistory)) return false;
          const target = context.navHistory.stack[context.navHistory.index - 1];
          return target !== null && context.flows.some(f => f.id === target);
        },
        target: '.view',
        actions: assign(({ context }) => {
          const result = goBack(context.navHistory)!;
          trpc.bus.send.mutate({ systemId: id, type: 'FLOW_SELECT', flowId: result.entry as string });
          return { navHistory: result.history };
        }),
      },
    ],
    NAVIGATE_FORWARD: [
      {
        guard: ({ context }) => {
          if (!canGoForward(context.navHistory)) return false;
          return context.navHistory.stack[context.navHistory.index + 1] === null;
        },
        target: '.list',
        actions: assign(({ context }) => {
          const result = goForward(context.navHistory)!;
          return { navHistory: result.history, selectedFlowId: undefined };
        }),
      },
      {
        guard: ({ context }) => {
          if (!canGoForward(context.navHistory)) return false;
          const target = context.navHistory.stack[context.navHistory.index + 1];
          return target !== null && context.flows.some(f => f.id === target);
        },
        target: '.view',
        actions: assign(({ context }) => {
          const result = goForward(context.navHistory)!;
          trpc.bus.send.mutate({ systemId: id, type: 'FLOW_SELECT', flowId: result.entry as string });
          return { navHistory: result.history };
        }),
      },
    ],
    TRAIL_CLICK: [
      {
        guard: { type: 'targetIs', params: { view: 'list' } },
        target: '.list',
        actions: assign(({ context }) => ({ navHistory: pushNavHistory(context.navHistory, null) })),
      },
      {
        guard: { type: 'targetIs', params: { view: 'view' } },
        target: '.view',
      },
    ],
  },
  states: {
    list: {
      tags: ['list-flows'],
      meta: { ...breadcrumb('list', 'Flows', true) },
      on: {
        'FLOW.PREVIEW': {
          actions: 'selectFlow',
          // Stay in list state - just load the flow data
        },
        'FLOW.SELECT': {
          actions: 'selectFlow',
          target: 'view',
        },
        'SELECT_ROOT_FLOW': {
          actions: 'selectRootFlow',
          target: 'view',
        },
        'FLOW.CREATE': {
          actions: 'sendCreateFlow',
        },
        'FLOW.DELETE': {
          actions: 'sendDeleteFlow',
        },
        'FLOW.UPDATE_LABEL': {
          actions: ['updateFlowLabel', 'sendUpdateLabel'],
        },
      }
    },
    view: {
      exit: ['deselectNode', 'deselectHandle'],
      tags: ['view-flow'],
      meta: {
        ...breadcrumbWithParams<FlowsContext>({
          target: 'view',
          getLabel: (ctx) => {
            if (!ctx.selectedFlowId) return '';

            // Find in flows array
            const flow = ctx.flows.find(f => f.id === ctx.selectedFlowId);

            // Check if it's the root flow (based on settings)
            if (flow && ctx.settings?.rootFlowId === flow.id) {
              return `${flow.label || 'Flow'} (Root)`;
            }

            return flow?.label || ctx.selectedFlowId;
          }
        }),
        ...contextMenuFn<FlowsContext>((ctx) => {
          const isRoot = ctx.selectedFlowId === ctx.settings?.rootFlowId;
          return [
            { label: 'Edit Label', icon: Edit, event: { type: 'FLOW.REQUEST_EDIT_LABEL' }, iconColor: 'text-primary-400' },
            ...(!isRoot ? [{
              separator: true as const, label: 'Delete Flow', icon: Trash2,
              event: { type: 'FLOW.REQUEST_DELETE' as const }, iconColor: 'text-red-400'
            }] : []),
          ];
        }),
      },
      on: {
        'FLOW.SELECT': { actions: 'selectFlow'},
        'SELECT_ROOT_FLOW': { actions: 'selectRootFlow' },
        'SELECT_AND_EDIT_FIRST_NODE': { actions: 'selectAndEditFirstNode' },
        'NODE.CLICK': [
          // If handle is selected, connect to clicked node
          {
            guard: 'hasSelectedHandle',
            actions: 'connectFromHandleAndSend',
          },
          // Otherwise, just select the node
          {
            actions: 'selectNode',
          },
        ],
        'NODE.SELECTION_CHANGE': { actions: 'handleSelectionChange' },
        'NODE.DOUBLE_CLICK': { actions: 'editNode' },
        'NODE.EDITOR.CLOSE': { actions: 'closeNodeEditor' },
        'HANDLE.SELECT': { actions: 'selectHandle' },
        'HANDLE.DESELECT': { actions: 'deselectHandle' },
        'HANDLE.REINDEX': { actions: ['reindexHandles', 'sendReindexHandles'] },
        'NODE.DELETE': { actions: ['deleteNode', 'sendNodeDeleted'] },
        'EDGE.CONNECT': { actions: ['connectEdge', 'sendEdgeConnected'] },
        'EDGE.DISCONNECT': { actions: ['disconnectEdge', 'sendEdgeDisconnected'] },
        'EDGE.RECONNECT': { actions: ['reconnectEdge', 'sendEdgeReconnected'] },
        'NODE.CREATE': {
          actions: 'createNode',
        },
        'NODE.CREATE_CONNECTED': {
          actions: 'createConnectedNode',
        },
        'NODE.UPDATE': {
          actions: ['updateNode', 'sendNodeUpdate'],
        },
        'NODE.UPDATE_POSITION': {
          actions: 'updateNodePosition',
        },
        'FLOW.DELETE': {
          actions: 'sendDeleteFlow',
        },
        'FLOW.UPDATE_LABEL': {
          actions: ['updateFlowLabel', 'sendUpdateLabel'],
        },
        'FLOW.REQUEST_EDIT_LABEL': { actions: 'requestEditLabel' },
        'FLOW.REQUEST_DELETE': { actions: 'requestDeleteFlow' },
        'FLOW.DIALOG_CLOSED': { actions: 'closeDialogs' },
        'GO.BACK': {
          target: 'list',
          actions: assign(({ context }) => ({
            navHistory: pushNavHistory(context.navHistory, null),
          })),
        },
      },
    },
  },
})

export default flowsState