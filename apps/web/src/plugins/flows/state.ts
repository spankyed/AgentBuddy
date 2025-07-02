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
} from '@abuddy/api'
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
  selectedFlowId?: EARS.EntityId;
  graph: {
    nodes: Partial<NodeEntity>[];
    edges: EdgeEntity[];
  };
  flows: Partial<FlowEntity>[];
  rootFlow?: Partial<FlowEntity>;
  logs: { id: number; text: string }[];
  prompts: PromptEntity[];
  models: ModelConfig[];
  isLoadingFormData: boolean;
}

type SystemEvent = OutgoingFlowsEvents

type UIEvent =
  | { type: 'NODE.CLICK'; nodeId: string }
  | { type: 'EDGE.CONNECT'; src: string; tgt: string }
  | { type: 'NODE.CREATE'; nodeType: string }
  | { type: 'NODE.UPDATE'; nodeId: EARS.EntityId; updates: Partial<NodeEntity> }
  | { type: 'FLOW.SELECT'; flowId: EARS.EntityId }
  | { type: 'FLOW.CREATE'; }
  | { type: 'FLOW.UPDATE_LABEL'; flowId: EARS.EntityId; label: string }
  | { type: 'GO.BACK' }
  | { type: 'FETCH_LLM_FORM_DATA' }

export type FlowsEvents = UIEvent | SystemEvent | TrailClickEvent
const typeOf = safeEvents<FlowsEvents>()

const flowsState = setup({
  types: {
    context: {} as FlowsContext,
    events: {} as FlowsEvents,
  },
  actions: {
    /* ── bootstrap ─────────────────────────────────────── */
    setPluginData: assign(({ event }) => {
      const ev = typeOf('FLOWS_STARTUP', event);
      return { ...ev.data, logs: [], prompts: [], models: [], isLoadingFormData: false }
    }),

    fetchLLMFormData: assign(() => {
      trpc.bus.send.mutate({
        systemId: id,
        type: 'FETCH_LLM_FORM_DATA'
      });
      return { isLoadingFormData: true };
    }),

    setLLMFormData: assign(({ event }) => {
      const ev = typeOf('LLM_FORM_DATA_FETCHED', event);
      return { models: ev.models, prompts: ev.prompts, isLoadingFormData: false };
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

    loadFlowData: assign(({ event }) => {
      const ev = typeOf('FLOW_SELECTED', event);
      return {
        selectedFlowId: ev.flowId,
        selectedNodeId: undefined,
        graph: {
          nodes: ev.data.nodes,
          edges: ev.data.edges,
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
      
      // Update root flow if it's the one being edited
      if (context.rootFlow?.id === ev.flowId) {
        return {
          rootFlow: { ...context.rootFlow, label: ev.label }
        };
      }
      
      // Otherwise update in flows list
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
      };
    }),

    /* ── graph interactions ───────────────────────────────── */
    selectNode: assign({ selectedNodeId: ({ event }) => typeOf('NODE.CLICK', event).nodeId as EARS.EntityId }),
    connectEdge: assign(({ context, event }) => {
      const id = `Edge-${randId()}`
      const ev = typeOf('EDGE.CONNECT', event)
      const newEdge = { id, source: ev.src, target: ev.tgt, kind: 'transitions_to' } as EdgeEntity
      context.logs.unshift({ id: Date.now(), text: `${ev.src}→${ev.tgt}` })
      
      return { 
        graph: {
          ...context.graph,
          edges: [...context.graph.edges, newEdge],
        },
        logs: context.logs,
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
    
    deselectNode: assign({ selectedNodeId: undefined }),

    createNode: assign(({ context, event }) => {
      if (!context.selectedFlowId) {
        return { selectedNodeId: undefined } // Deselect any node before creating a new one
      }

      const tempId = `temp-${randId()}`
      const ev = typeOf('NODE.CREATE', event)
      const newNode = {
        id: tempId,
        nodeType: ev.nodeType,
        label: `New ${ev.nodeType}`,
      } as Partial<NodeEntity>
      
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

      return {
        graph: {
          ...context.graph,
          nodes: [...context.graph.nodes, newNode],
        },
        selectedNodeId: tempId as EARS.EntityId,
      }
    }),

    /* ── node update actions ──────────────────────────────── */
    updateNode: assign(({ context, event }) => {
      const ev = typeOf('NODE.UPDATE', event);
      return {
        graph: {
          ...context.graph,
          nodes: context.graph.nodes.map(node =>
            node.id === ev.nodeId ? { ...node, ...ev.updates } : node
          ),
        },
      };
    }),

    sendNodeUpdate: ({ context, event }) => {
      const ev = typeOf('NODE.UPDATE', event);
      if (!context.selectedFlowId) return;
      
      const node = context.graph.nodes.find(n => n.id === ev.nodeId);
      if (!node) return;

      // Send update to backend
      trpc.bus.send.mutate({
        systemId: id,
        type: 'UPDATE_NODE',
        flowId: context.selectedFlowId,
        nodeId: ev.nodeId,
        nodeData: { ...node, ...ev.updates },
      });
    },

    /* ── ID reconciliation actions ────────────────────────── */
    reconcileNodeId: assign(({ context, event }) => {
      const ev = typeOf('NODE_CREATED', event);
      const { tempId, nodeId: permanentId, node } = ev;
      
      // Update the node with permanent ID
      const updatedNodes = context.graph.nodes.map(n => 
        n.id === tempId ? { ...node, id: permanentId } : n
      );
      
      // Update selected node ID if it was the temp one
      const newSelectedNodeId = context.selectedNodeId === tempId 
        ? permanentId 
        : context.selectedNodeId;
      
      // Update edges that reference the temporary ID
      const updatedEdges = context.graph.edges.map(edge => ({
        ...edge,
        source: edge.source === tempId ? permanentId : edge.source,
        target: edge.target === tempId ? permanentId : edge.target,
      }));
      
      return {
        graph: {
          nodes: updatedNodes,
          edges: updatedEdges,
        },
        selectedNodeId: newSelectedNodeId,
      };
    }),
  },
  guards: { targetIs },
}).createMachine({
  id,
  initial: 'list',
  context: {
    selectedNodeId: undefined,
    selectedFlowId: undefined,
    graph: {
      nodes: [] as Partial<NodeEntity>[],
      edges: [] as EdgeEntity[],
    },
    flows: [] as Partial<FlowEntity>[],
    rootFlow: undefined as Partial<FlowEntity> | undefined,
    logs: [] as { id: number; text: string }[],
    prompts: [] as PromptEntity[],
    models: [] as ModelConfig[],
    isLoadingFormData: false,
  },
  on: {
    FLOWS_STARTUP: { actions: 'setPluginData' },
    LLM_FORM_DATA_FETCHED: { actions: 'setLLMFormData' },
    FLOW_SELECTED: { actions: 'loadFlowData' },
    FLOW_CREATED: { 
      actions: ['addCreatedFlow', 'selectFlow'],
      target: '.view'
    },
    NODE_CREATED: { 
      actions: 'reconcileNodeId'
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
            
            // Check if it's the root flow
            if (ctx.rootFlow?.id === ctx.selectedFlowId) {
              return ctx.rootFlow.label || 'Root Flow';
            }
            
            // Find in flows array
            const flow = ctx.flows.find(f => f.id === ctx.selectedFlowId);
            return flow?.label || ctx.selectedFlowId;
          }
        })
      },
      on: {
        'NODE.CLICK': { actions: 'selectNode' },
        'EDGE.CONNECT': { actions: ['connectEdge', 'sendEdgeConnected'] },
        'NODE.CREATE': {
          actions: 'createNode',
        },
        'NODE.UPDATE': {
          actions: ['updateNode', 'sendNodeUpdate'],
        },
        'FLOW.UPDATE_LABEL': {
          actions: ['updateFlowLabel', 'sendUpdateLabel'],
        },
        'GO.BACK': {
          target: 'list',
        },
        'FETCH_LLM_FORM_DATA': {
          actions: 'fetchLLMFormData',
        },
      },
    },
  },
})

export default flowsState