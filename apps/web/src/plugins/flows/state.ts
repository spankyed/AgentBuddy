// flows/state.ts – clean rewrite w/ correct context initialisation
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

/* ─────────────────────────────────────────────────────────── */
/* Helpers                                                     */
/* ─────────────────────────────────────────────────────────── */
/** Short random id (~6 chars, base‑36). */
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
  elements: ReturnType<typeof buildElements>
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

/* ─────────────────────────────────────────────────────────── */
/* Machine Definition                                          */
/* ─────────────────────────────────────────────────────────── */
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
      context.elements = buildElements(context.nodes, context.events, context.edges)
      context.logs.unshift({ id: Date.now(), text: `${ev.src}→${ev.tgt}` })
      return { edges: context.edges, elements: context.elements, logs: context.logs }
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
      context.elements = buildElements(context.nodes, context.events, context.edges)
      return { nodes: context.nodes, selectedNodeId: id, elements: context.elements }
    }),
  },
  guards: { targetIs },
}).createMachine({
  id,
  initial: 'display',
  /**  ✅  correct initial context */
  context: {
    nodes: {},
    events: {},
    edges: {},
    elements: [],
    logs: [],
  },
  states: {
    display: {
      meta: breadcrumb('display', 'Display', true),
      on: {
        'NODE.CLICK': { actions: 'selectNode' },
        'EDGE.CONNECT': { actions: 'connectEdge' },
        'NODE.DRAG_CREATE': { actions: 'createNode' },
      },
    },
  },
  on: {
    FLOWS_STARTUP: { actions: 'setPluginData' },
    ...TRAIL_CLICK([['.display', 'display']]),
  },
})

export default flowsState

/* ─────────────────────────────────────────────────────────── */
/* Selectors                                                   */
/* ─────────────────────────────────────────────────────────── */
export const elementsSelector = (s: any) => s.context.elements
export const logsSelector = (s: any) => s.context.logs
export const selectedSelector = (s: any) =>
  s.context.nodes[s.context.selectedNodeId ?? '']
