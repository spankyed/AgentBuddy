import { assign, setup, type ActorRefFrom } from 'xstate'
import breadcrumb from '@/core/breadcrumb'
import { safeEvents } from '@/core/types/safe-events'
import {
  targetIs,
  TRAIL_CLICK,
  type TrailClickEvent,
} from '@/core/actors/route-trailer'
import type {
  FlowsStartupData,
  OutgoingFlowsEvents,
} from '@abuddy/api'
import { type UiNode, type UiEvent, type UiEdge, startupToUiGraph, buildElements } from './graph'

const randId = () => Math.random().toString(36).slice(2, 8)

/* ─────────────────────────────────────────────────────────── */
/* Machine Types                                               */
/* ─────────────────────────────────────────────────────────── */
export const id = 'flows'
export type FlowsState = ActorRefFrom<typeof flowsState>

export interface FlowsContext {
  nodes: Record<string, UiNode>
  events: Record<string, UiEvent>
  edges: Record<string, UiEdge>
  selectedNodeId?: string
  logs: { id: number; text: string }[]
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
      const ev = typeOf('FLOWS_STARTUP', event)
      const ui = startupToUiGraph(ev.data)
      return { ...ui, logs: [] }
    }),

    /* ── UI interactions ───────────────────────────────── */
    selectNode: assign({ selectedNodeId: ({ event }) => typeOf('NODE.CLICK', event).nodeId }),

    connectEdge: assign(({ context, event }) => {
      const id = `Edge-${randId()}`
      const ev = typeOf('EDGE.CONNECT', event)
      context.edges[id] = { id, from: ev.src, to: ev.tgt, kind: 'transitions_to' }
      context.logs.unshift({ id: Date.now(), text: `${ev.src}→${ev.tgt}` })
      return { edges: context.edges, logs: context.logs }
    }),

    createNode: assign(({ context, event }) => {
      const id = `Step-${randId()}`
      const ev = typeOf('NODE.DRAG_CREATE', event)
      context.nodes[id] = {
        id,
        stepType: ev.stepType,
        label: `New ${ev.stepType}`,
        x: ev.x,
        y: ev.y,
      }
      context.selectedNodeId = id
      return { nodes: context.nodes, selectedNodeId: id }
    }),
  },
  guards: { targetIs },
}).createMachine({
  id,
  initial: 'view',
  context: {
    nodes: {},
    events: {},
    edges: {},
    logs: [],
  },
  on: {
    FLOWS_STARTUP: { actions: 'setPluginData' },
    ...TRAIL_CLICK([['.view', 'view']]),
  },
  states: {
    list: {

    },
    view: {
      initial: 'details',
      meta: breadcrumb('view', 'View', true),
      on: {
        'NODE.CLICK': { actions: 'selectNode' },
        'EDGE.CONNECT': { actions: 'connectEdge' },
        'NODE.DRAG_CREATE': { actions: 'createNode' },
      },
      states: {
        overview: {},
        details: {},
      }
    },
  },
})

export default flowsState