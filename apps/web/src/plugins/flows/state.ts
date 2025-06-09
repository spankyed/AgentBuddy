import { assign, setup, type ActorRefFrom } from 'xstate'
import breadcrumb from '@/core/breadcrumb'
import { safeEvents } from '@/core/types/safe-events'
import {
  targetIs,
  TRAIL_CLICK,
  type TrailClickEvent,
} from '@/core/actors/route-trailer'
import type {
  FlowEntity,
  OutgoingFlowsEvents,
  StepEntity,
  EARS,
  EdgeEntity,
} from '@abuddy/api'

const randId = () => Math.random().toString(36).slice(2, 8)

/* ─────────────────────────────────────────────────────────── */
/* Machine Types                                               */
/* ─────────────────────────────────────────────────────────── */
export const id = 'flows'
export type FlowsState = ActorRefFrom<typeof flowsState>

export interface FlowsContext {
  selectedNodeId?: EARS.EntityId;
  graph: {
    nodes: Partial<StepEntity>[];
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
  | { type: 'NODE.DRAG_CREATE'; stepType: string; x: number; y: number }

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

    /* ── UI interactions ───────────────────────────────── */
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
      const id = `Step-${randId()}`
      const ev = typeOf('NODE.DRAG_CREATE', event)
      const newNode = {
        id,
        stepType: ev.stepType,
        label: `New ${ev.stepType}`,
        x: ev.x,
        y: ev.y,
      } as Partial<StepEntity>
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
  initial: 'view',
  context: {
    graph: {
      nodes: [] as Partial<StepEntity>[],
      edges: [] as EdgeEntity[],
    },
    flows: {} as Partial<FlowEntity>[],
    rootFlow: undefined as Partial<FlowEntity> | undefined,
    logs: [] as { id: number; text: string }[],
  },
  on: {
    FLOWS_STARTUP: { actions: 'setPluginData' },
    ...TRAIL_CLICK([['.view', 'view']]),
  },
  states: {
    list: {

    },
    view: {
      initial: 'overview',
      meta: breadcrumb('view', 'View', true),
      on: {
        'NODE.CLICK': { actions: 'selectNode' },
        'EDGE.CONNECT': { actions: 'connectEdge' },
        'NODE.DRAG_CREATE': {
          actions: 'createNode',
          target: '.details',
        },
      },
      states: {
        overview: {},
        details: {},
      }
    },
  },
})

export default flowsState