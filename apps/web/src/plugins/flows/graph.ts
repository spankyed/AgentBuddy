import type { FlowsStartupData } from "@abuddy/api"

// flows/state.ts  (top of file, before the machine)
export interface UiNode {
  id: string
  stepType: string
  label: string
  x: number
  y: number
  [k: string]: unknown        // prompt, condition, …
}
export interface UiEvent {
  id: string
  label: string
  color: string
}
export interface UiEdge {
  id: string
  from: string
  to: string
  kind: 'transitions_to' | 'emits' | 'consumed_by'
}

export interface FlowsContext {
  nodes: Record<string, UiNode>
  events: Record<string, UiEvent>
  edges: Record<string, UiEdge>
  /** Vue-Flow baked nodes + edges */
  elements: ReturnType<typeof buildElements>
  selectedNodeId?: string
  logs: { id: number; text: string }[]
}


/*──────────────── helper to turn BE → UI ────────────────*/
export function startupToUiGraph(data: FlowsStartupData) {
  /* maps give O(1) lookups & are reactive-friendly */
  const nodes: Record<string, UiNode> = {}
  const events: Record<string, UiEvent> = {}

  for (const e of data.entity) {
    if (e.entityType === 'Step') nodes[e.id] = e as unknown as UiNode
    if (e.entityType === 'FlowEvent') events[e.id] = e as unknown as UiEvent
  }

  const edges: Record<string, UiEdge> = {}

  let idx = 0
  for (const r of data.relation) {
    if (r.kind === 'contains') continue
    edges[`Edge-${idx}`] = {
      id: `Edge-${idx}`,
      from: r.srcId,
      to: r.tgtId,
      kind: r.kind as UiEdge['kind'],
    }
    idx++
  }

  /* Vue-Flow array (old rowsToElements) */
  const elements = buildElements(nodes, events, edges)

  return { nodes, events, edges, elements } as const
}
/*──────────────── style helper moved verbatim ───────────*/
const colorForType = (t: string) =>
({ input: '#00bcd4', transform: '#9c27b0', llm: '#607d8b', output: '#4caf50' }[
  t as keyof any
] ?? '#888')

export function buildElements(
  nodes: Record<string, UiNode>,
  events: Record<string, UiEvent>,
  edges: Record<string, UiEdge>,
) {
  const vueNodes = Object.values(nodes).map((n) => ({
    id: n.id,
    position: { x: n.x, y: n.y },
    data: n,
    style: {
      border: `2px solid ${colorForType(n.stepType)}`,
      'border-radius': '8px',
      'background-color': 'transparent',
      padding: '6px 14px',
      color: '#fff',
    },
    label: n.label,
  }))

  /* optional: render events as invisible anchor points */
  const vueEventNodes = Object.values(events).map((e) => ({
    id: e.id,
    position: { x: 0, y: 0 },     // will be auto-laid-out or hidden
    // type: 'event',
    data: e,
  }))

  const vueEdges = Object.values(edges).map((e) => {
    const dashed = e.kind !== 'transitions_to'
    return {
      id: e.id,
      source: e.from,
      target: e.to,
      type: dashed ? 'straight' : 'smoothstep',
      style: dashed ? { 'stroke-dasharray': '4 4', stroke: '#b084f5' } : undefined,
      markerEnd: { type: 'arrowclosed', color: dashed ? '#b084f5' : '#999' },
    }
  })

  return [...vueNodes, ...vueEventNodes, ...vueEdges]
}