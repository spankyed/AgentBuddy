import { nextTick, unref } from 'vue'
import dagre from 'dagre'
import type { Edge, Node, GraphNode } from '@vue-flow/core'
import { useVueFlow, Position as VFPosition } from '@vue-flow/core'

export type Direction = 'LR' | 'TB'          // horizontal or vertical

/**
 * Calculate new positions for the passed‑in nodes using Dagre.
 * Returns a fresh array; the originals are NOT mutated.
 */
export function useLayout() {
  const { findNode, getNodes, getEdges, setNodes, fitView } = useVueFlow()

  async function layout(dir: Direction = 'TB', updateState?: (node: Node, position: { x: number, y: number }) => void) {
    const nodes = unref(getNodes)
    const edges = unref(getEdges)
    const g = new dagre.graphlib.Graph<GraphNode>()
      .setGraph({ rankdir: dir, nodesep: 70, ranksep: 70 })
      .setDefaultEdgeLabel(() => ({}))

    const horizontal = dir === 'LR'

    // 1️⃣  Build Dagre graph
    for (const n of nodes) {
      const vfNode = findNode(n.id)
      g.setNode(n.id, {
        width:  vfNode?.dimensions?.width  ?? 150,
        height: vfNode?.dimensions?.height ?? 50,
      })
    }
    for (const e of edges) g.setEdge(e.source, e.target)

    dagre.layout(g)
    const laidOut = nodes.map((n) => {
      const pos = g.node(n.id)!
      return {
        ...n,
        position: { x: pos.x, y: pos.y },
        targetPosition: horizontal ? VFPosition.Left  : VFPosition.Top,
        sourcePosition: horizontal ? VFPosition.Right : VFPosition.Bottom,
      }
    })

    // 4️⃣ Update nodes and refresh view
    setNodes(laidOut)
    await nextTick()
    fitView()

    return laidOut
  }

  return { layout }
}
