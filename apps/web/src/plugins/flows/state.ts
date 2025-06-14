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
} from '@abuddy/api'
import { trpc } from '@/core/trpc'

const randId = () => Math.random().toString(36).slice(2, 8)

/* ─────────────────────────────────────────────────────────── */
/* Machine Types                                               */
/* ─────────────────────────────────────────────────────────── */
export const id = 'flows'
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
}

type SystemEvent = OutgoingFlowsEvents

type UIEvent =
  | { type: 'NODE.CLICK'; nodeId: string }
  | { type: 'EDGE.CONNECT'; src: string; tgt: string }
  | { type: 'NODE.DRAG_CREATE'; nodeType: string; x: number; y: number }
  | { type: 'FLOW.SELECT'; flowId: EARS.EntityId }
  | { type: 'FLOW.CREATE'; }
  | { type: 'FLOW.UPDATE_LABEL'; flowId: EARS.EntityId; label: string }
  | { type: 'GO.BACK' }

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
      return { ...ev.data, logs: [] }
    }),

    /* ── flow interactions ────────────────────────────── */
    selectFlow: ({ event }) => {
      const ev = typeOf(['FLOW.SELECT', 'FLOW_CREATED'], event);
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

    createNode: assign(({ context, event }) => {
      const id = `Node-${randId()}`
      const ev = typeOf('NODE.DRAG_CREATE', event)
      const newNode = {
        id,
        nodeType: ev.nodeType,
        label: `New ${ev.nodeType}`,
        x: ev.x,
        y: ev.y,
      } as Partial<NodeEntity>
      return { 
        graph: {
          ...context.graph,
          nodes: [...context.graph.nodes, newNode],
        },
        selectedNodeId: id as EARS.EntityId,
      }
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
  },
  on: {
    FLOWS_STARTUP: { actions: 'setPluginData' },
    FLOW_SELECTED: { actions: 'loadFlowData' },
    FLOW_CREATED: { 
      actions: ['addCreatedFlow', 'selectFlow'],
      target: '.view'
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
      tags: ['view-flow'],
      meta: {
        ...breadcrumbWithParams<FlowsContext>({
          target: 'view',
          // prefix: 'Flow',
          paramName: 'selectedFlowId'
        })
      },
      on: {
        'NODE.CLICK': { actions: 'selectNode' },
        'EDGE.CONNECT': { actions: 'connectEdge' },
        'NODE.DRAG_CREATE': {
          actions: 'createNode',
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