import { assign, log, setup, type ActorRefFrom } from 'xstate'
import breadcrumb, { breadcrumbWithParams } from '@/core/breadcrumb'
import { safeEvents } from '@/core/types/safe-events'
import {
  targetIs,
  TRAIL_CLICK,
  type TrailClickEvent,
} from '@/core/actors/route-trailer'
import type {
  FlowEntity,
  OutgoingFlowsEvents,
  NodeEntity,
  EARS,
  EdgeEntity,
  PromptEntity,
  ModelConfig,
  ActionEntity,
  TNodeEntity,
  TrackEntity,
  OutgoingBrainEvents,
} from '@app/api'
import { trpc } from '@/core/trpc'

const randId = () => Math.random().toString(36).slice(2, 8)

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
  graph: {
    nodes: NodeEntity[];
    edges: EdgeEntity[];
    // Store positions separately from node data
    positions: Record<string, { x: number; y: number }>;
  };
  flows: FlowEntity[];
  // Resources available for node configuration
  prompts: PromptEntity[];
  models: ModelConfig[];
  actions: ActionEntity[];
  // Track temporary IDs during async creation
  tempIdMap: Record<string, string>; // tempId -> permanentId
  // Settings
  settings?: any; // FlowsSettings
}

type SystemEvent = OutgoingFlowsEvents

type UIEvent =
  | { type: 'NODE.CLICK'; nodeId: string }
  | { type: 'NODE.DOUBLE_CLICK'; nodeId: string }
  | { type: 'NODE.EDITOR.CLOSE' }
  | { type: 'NODE.DELETE'; nodeId: string }
  | { type: 'NODE.SELECTION_CHANGE'; nodeId: string; selected: boolean }
  | { type: 'EDGE.CONNECT'; src: string; tgt: string }
  | { type: 'EDGE.DISCONNECT'; edgeId: string }
  | { type: 'EDGE.RECONNECT'; edgeId: string; oldSource: string; oldTarget: string; newSource: string; newTarget: string }
  | { type: 'NODE.CREATE'; nodeType: string; position?: { x: number; y: number } }
  | { type: 'NODE.CREATE_CONNECTED'; nodeType: string; sourceNodeId: string }
  | { type: 'NODE.UPDATE'; nodeId: EARS.EntityId; updates: Partial<NodeEntity> }
  | { type: 'NODE.UPDATE_POSITION'; nodeId: string; position: { x: number; y: number } }
  | { type: 'FLOW.SELECT'; flowId: EARS.EntityId }
  | { type: 'SELECT_ROOT_FLOW' }
  | { type: 'SELECT_AND_EDIT_FIRST_NODE' }
  | { type: 'FLOW.CREATE'; }
  | { type: 'FLOW.UPDATE_LABEL'; flowId: EARS.EntityId; label: string }
  | { type: 'GO.BACK' }
  | { type: 'FLOWS_SETTINGS_UPDATED'; settings: any }

export type FlowsEvents = UIEvent | SystemEvent | TrailClickEvent
const typeOf = safeEvents<FlowsEvents>()

const flowsState = setup({
  types: {
    context: {} as FlowsContext,
    events: {} as FlowsEvents,
  },
  actions: {
    /* ── bootstrap ─────────────────────────────────────── */
    setPluginData: assign(({ context, event }) => {
      const ev = typeOf('FLOWS_CONNECTED', event);
      return {
        flows: (ev.data.flows || []) as FlowEntity[],
        prompts: ev.data.prompts || [],
        models: ev.data.models || [],
        actions: ev.data.actions || [],
        selectedFlowId: ev.data.selectedFlowId,
        graph: {
          ...ev.data.graph,
          positions: context.graph?.positions || {}, // Preserve existing positions
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
      const ev = typeOf(['FLOW.SELECT', 'FLOW_CREATED'], event);
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

    loadFlowData: assign(({ context, event }) => {
      const ev = typeOf('FLOW_SELECTED', event);

      return {
        selectedFlowId: ev.flowId,
        selectedNodeId: undefined,
        graph: {
          nodes: ev.data.nodes,
          edges: ev.data.edges,
          positions: context.graph?.positions || {}, // Preserve existing positions
        },
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

    addCreatedFlow: assign(({ context, event }) => {
      const ev = typeOf('FLOW_CREATED', event);
      
      return {
        flows: [...context.flows, ev.flow],
        selectedFlowId: ev.flowId,
        graph: {
          nodes: ev.data.nodes,
          edges: ev.data.edges,
          positions: {}, // Start with empty positions, will be set by layout
        },
      };
    }),

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
      const id = `Edge-${randId()}`
      const ev = typeOf('EDGE.CONNECT', event)
      const newEdge = { id, source: ev.src, target: ev.tgt, kind: 'transitions_to' } as EdgeEntity
      
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

    createNode: assign(({ context, event }) => {
      if (!context.selectedFlowId) {
        return { selectedNodeId: undefined } // Deselect any node before creating a new one
      }

      const tempId = `temp-${randId()}`
      const ev = typeOf('NODE.CREATE', event)
      
      // Create a partial node that will be completed by the backend
      const newNode = {
        id: tempId,
        nodeType: ev.nodeType,
        label: `New ${ev.nodeType}`,
        flowId: context.selectedFlowId,
        configuration: {},
      } as any // Will be properly typed when backend returns complete node
      
      // Send create to backend if we have a flow selected
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

      // Use provided position if available, otherwise it will be set by layout
      const updatedPositions = ev.position 
        ? { ...context.graph.positions, [tempId]: ev.position }
        : context.graph.positions;

      return {
        graph: {
          ...context.graph,
          nodes: [...context.graph.nodes, newNode],
          positions: updatedPositions,
        },
        selectedNodeId: tempId as EARS.EntityId,
        editingNodeId: tempId as EARS.EntityId, // Also open editor for new nodes
        tempIdMap: {
          ...context.tempIdMap,
          [tempId]: tempId, // Will be updated when we get permanent ID
        }
      }
    }),

    createConnectedNode: assign(({ context, event }) => {
      if (!context.selectedFlowId) {
        return { selectedNodeId: undefined }
      }

      const tempId = `temp-${randId()}`
      const ev = typeOf('NODE.CREATE_CONNECTED', event)
      const newNode = {
        id: tempId,
        nodeType: ev.nodeType,
        label: `New ${ev.nodeType}`,
        flowId: context.selectedFlowId,
        configuration: {},
      } as any // Will be properly typed when backend returns complete node
      
      // Create temporary edge
      const tempEdgeId = `Edge-${randId()}`
      const tempEdge: EdgeEntity = {
        id: tempEdgeId,
        source: ev.sourceNodeId,
        target: tempId,
        kind: 'transitions_to'
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

      return {
        graph: {
          ...context.graph,
          nodes: [...context.graph.nodes, newNode],
          edges: [...context.graph.edges, tempEdge],
        },
        selectedNodeId: tempId as EARS.EntityId,
        editingNodeId: tempId as EARS.EntityId, // Also open editor for new connected nodes
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
      const { sourceId, targetId, relId } = ev;
      
      // Find the edge with matching source and target
      const updatedEdges = context.graph.edges.map(edge => {
        if (edge.source === sourceId && edge.target === targetId) {
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
  },
  guards: { targetIs },
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
    FLOW_CREATED: { 
      actions: 'addCreatedFlow',
      target: '.view'
    },
    NODE_CREATED: { 
      actions: 'reconcileNodeId'
    },
    EDGE_CREATED: {
      actions: 'reconcileEdgeId'
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
    ...TRAIL_CLICK([
      ['.list', 'list'],
      ['.view', 'view'],
    ]),
  },
  states: {
    list: {
      tags: ['list-flows'],
      meta: { ...breadcrumb('list', 'Flows', true) },
      on: {
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
        'FLOW.UPDATE_LABEL': {
          actions: ['updateFlowLabel', 'sendUpdateLabel'],
        },
      }
    },
    view: {
      exit: 'deselectNode',
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
        })
      },
      on: {
        'FLOW.SELECT': { actions: 'selectFlow'},
        'SELECT_ROOT_FLOW': { actions: 'selectRootFlow' },
        'SELECT_AND_EDIT_FIRST_NODE': { actions: 'selectAndEditFirstNode' },
        'NODE.CLICK': { actions: 'selectNode' },
        'NODE.SELECTION_CHANGE': { actions: 'handleSelectionChange' },
        'NODE.DOUBLE_CLICK': { actions: 'editNode' },
        'NODE.EDITOR.CLOSE': { actions: 'closeNodeEditor' },
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
        'FLOW.UPDATE_LABEL': {
          actions: ['updateFlowLabel', 'sendUpdateLabel'],
        },
        'GO.BACK': {
          target: 'list',
        },
      },
    },
  },
})

export default flowsState