import dagre from 'dagre'

export type LayoutDirection = 'LR' | 'TB'

interface LayoutInput {
  nodes: { id: string }[]
  edges: { source: string; target: string }[]
}

interface LayoutOptions {
  direction?: LayoutDirection
  nodeWidth?: number
  nodeHeight?: number
  nodeSep?: number
  rankSep?: number
}

export type LayoutPositions = Record<string, { x: number; y: number }>

/**
 * Pure layout calculation function - no Vue/VueFlow dependency.
 * Takes nodes and edges, returns positions for each node.
 * Uses dagre for automatic graph layout.
 */
export function calculateLayout(
  input: LayoutInput,
  options: LayoutOptions = {}
): LayoutPositions {
  const {
    direction = 'LR',
    nodeWidth = 150,
    nodeHeight = 50,
    nodeSep = 70,
    rankSep = 70,
  } = options

  // Handle empty input
  if (input.nodes.length === 0) {
    return {}
  }

  const g = new dagre.graphlib.Graph()
    .setGraph({ rankdir: direction, nodesep: nodeSep, ranksep: rankSep })
    .setDefaultEdgeLabel(() => ({}))

  // Add nodes with default dimensions
  for (const node of input.nodes) {
    g.setNode(node.id, { width: nodeWidth, height: nodeHeight })
  }

  // Add edges
  for (const edge of input.edges) {
    g.setEdge(edge.source, edge.target)
  }

  // Run dagre layout algorithm
  dagre.layout(g)

  // Extract positions (convert dagre center coords to top-left for VueFlow)
  const positions: LayoutPositions = {}
  for (const node of input.nodes) {
    const pos = g.node(node.id)
    if (pos) {
      positions[node.id] = {
        x: pos.x - pos.width / 2,
        y: pos.y - pos.height / 2,
      }
    }
  }

  return positions
}

/**
 * Check if all nodes have valid positions
 */
export function allNodesHavePositions(
  nodes: { id: string }[],
  positions: LayoutPositions
): boolean {
  return nodes.every(
    node => positions[node.id]?.x !== undefined && positions[node.id]?.y !== undefined
  )
}
