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


  return { nodes, events, edges } as const
}
/*──────────────── style helper moved verbatim ───────────*/
export function colorForType(type: string) {
  return ({ input: '#00bcd4', transform: '#9c27b0', llm: '#607d8b', output: '#4caf50' }[
    type as keyof any
  ] ?? '#888')
}
