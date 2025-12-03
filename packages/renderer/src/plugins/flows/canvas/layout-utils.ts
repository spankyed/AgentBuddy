import ELK, { type ElkNode, type ElkExtendedEdge, type ElkPort } from 'elkjs/lib/elk.bundled.js'

/**
 * Centralized layout configuration.
 * Used by both ELK layout calculation and edge rendering.
 */
export const LAYOUT_CONFIG = {
  // Node dimensions
  nodeWidth: 200,
  nodeHeight: 50,

  // Node spacing (used by ELK)
  nodeSep: 60,       // Vertical spacing between nodes in same layer
  rankSep: 80,       // Horizontal spacing between layers

  // Edge rendering (used by GenericEdge)
  edge: {
    maxBendOffset: 50,    // Bend distance for close nodes
    minBendOffset: 20,    // Bend distance for far nodes
    cornerRadius: 8,      // Rounded corner radius
    straightThreshold: 5, // Below this vertical distance, edge is straight
    distanceNormalization: 200, // Divisor for normalizing vertical distance
  }
} as const

export type LayoutDirection = 'LR' | 'TB'

interface LayoutNode {
  id: string
  nodeType?: string
  conditions?: Array<{ expr: string; label?: string }>
}

interface LayoutEdge {
  id?: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
}

interface LayoutInput {
  nodes: LayoutNode[]
  edges: LayoutEdge[]
}

interface LayoutOptions {
  direction?: LayoutDirection
  nodeWidth?: number
  nodeHeight?: number
  nodeSep?: number
  rankSep?: number
}

export type LayoutPositions = Record<string, { x: number; y: number }>

// Create ELK instance (reusable singleton)
const elk = new ELK()

/**
 * Builds ELK-compatible graph structure from nodes and edges.
 * Handles port creation for switch nodes with multiple outputs.
 */
function buildElkGraph(input: LayoutInput, options: LayoutOptions): ElkNode {
  const {
    direction = 'LR',
    nodeWidth = LAYOUT_CONFIG.nodeWidth,
    nodeHeight = LAYOUT_CONFIG.nodeHeight,
    nodeSep = LAYOUT_CONFIG.nodeSep,
    rankSep = LAYOUT_CONFIG.rankSep,
  } = options

  const elkNodes: ElkNode[] = input.nodes.map((node) => {
    const ports: ElkPort[] = []
    const isSwitch = node.nodeType === 'decision'
    const branchCount = node.conditions?.length ?? 0

    // Calculate height for switch nodes based on branch count
    const calculatedHeight = isSwitch
      ? Math.max(nodeHeight, 48 + (branchCount + 1) * 22 + 10)
      : nodeHeight

    // Input port (except entry/listen nodes)
    if (node.nodeType !== 'listen') {
      ports.push({
        id: `${node.id}-in`,
        layoutOptions: { 'port.side': 'WEST' }
      })
    }

    // Output ports
    if (isSwitch) {
      // Switch nodes: one port per branch + otherwise
      for (let i = 0; i < branchCount; i++) {
        ports.push({
          id: `${node.id}-out-branch-${i}`,
          layoutOptions: {
            'port.side': 'EAST',
            'port.index': String(i)
          }
        })
      }
      // Always add 'otherwise' port last
      ports.push({
        id: `${node.id}-out-otherwise`,
        layoutOptions: {
          'port.side': 'EAST',
          'port.index': String(branchCount)
        }
      })
    } else if (node.nodeType !== 'fire') {
      // Regular nodes: single output (fire/terminal nodes have no output)
      ports.push({
        id: `${node.id}-out`,
        layoutOptions: { 'port.side': 'EAST' }
      })
    }

    return {
      id: node.id,
      width: nodeWidth,
      height: calculatedHeight,
      ports
    }
  })

  // Build ELK edges with port references
  // Sort edges by source port index to help ELK order targets correctly
  const sortedEdges = [...input.edges].sort((a, b) => {
    const getPortIndex = (handle?: string): number => {
      if (!handle) return 0
      if (handle === 'otherwise') return 999 // Last
      const match = handle.match(/branch-(\d+)/)
      return match ? parseInt(match[1], 10) : 0
    }
    return getPortIndex(a.sourceHandle) - getPortIndex(b.sourceHandle)
  })

  const elkEdges: ElkExtendedEdge[] = sortedEdges.map((edge, idx) => {
    // Determine source port
    const sourcePort = edge.sourceHandle
      ? `${edge.source}-out-${edge.sourceHandle}`
      : `${edge.source}-out`

    // Determine target port
    const targetPort = `${edge.target}-in`

    // Calculate priority based on port index (lower = higher priority = positioned earlier/higher)
    const getPortPriority = (handle?: string): number => {
      if (!handle) return 0
      if (handle === 'otherwise') return 100
      const match = handle.match(/branch-(\d+)/)
      return match ? parseInt(match[1], 10) : 0
    }

    return {
      id: edge.id || `e${idx}`,
      sources: [sourcePort],
      targets: [targetPort],
      layoutOptions: {
        // Priority affects node ordering - lower priority edges have their targets placed first (higher up)
        'elk.priority': String(getPortPriority(edge.sourceHandle))
      }
    }
  })

  // Root graph with layout options
  return {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': direction === 'LR' ? 'RIGHT' : 'DOWN',
      // Node spacing - controls visual separation between nodes
      // (VueFlow renders edges between nodes, so node spacing = edge separation)
      'elk.spacing.nodeNode': String(nodeSep),
      'elk.layered.spacing.nodeNodeBetweenLayers': String(rankSep),

      // Port constraints - respect port order on switch nodes
      'elk.portConstraints': 'FIXED_ORDER',

      // Critical: Force target nodes to be ordered by their source port order
      // This prevents edges from crossing by aligning targets with their source ports
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.layered.crossingMinimization.forceNodeModelOrder': 'true',

      // Consider model order for nodes and edges - align targets with source ports
      'elk.layered.considerModelOrder.strategy': 'PREFER_EDGES',

      // Node placement - use linear segments to minimize edge bends
      'elk.layered.nodePlacement.strategy': 'LINEAR_SEGMENTS',

      // Edge routing for bezier-compatible paths
      'elk.edgeRouting': 'SPLINES',
    },
    children: elkNodes,
    edges: elkEdges
  }
}

/**
 * Async layout calculation using ELK.
 * Returns positions for each node.
 */
export async function calculateLayoutAsync(
  input: LayoutInput,
  options: LayoutOptions = {}
): Promise<LayoutPositions> {
  // Handle empty input
  if (input.nodes.length === 0) {
    return {}
  }

  // Handle single node
  if (input.nodes.length === 1) {
    return { [input.nodes[0].id]: { x: 0, y: 0 } }
  }

  try {
    const elkGraph = buildElkGraph(input, options)
    const layoutedGraph = await elk.layout(elkGraph)

    // Extract positions from layouted graph
    const positions: LayoutPositions = {}
    for (const child of layoutedGraph.children ?? []) {
      if (child.id && child.x !== undefined && child.y !== undefined) {
        positions[child.id] = {
          x: child.x,
          y: child.y
        }
      }
    }

    return positions
  } catch (error) {
    console.error('ELK layout failed:', error)
    // Fallback: return simple horizontal layout
    return input.nodes.reduce((acc, node, index) => {
      acc[node.id] = { x: index * 200, y: 0 }
      return acc
    }, {} as LayoutPositions)
  }
}

/**
 * Synchronous layout calculation - returns placeholder positions.
 * Actual layout should use calculateLayoutAsync.
 * Kept for backward compatibility during migration.
 */
export function calculateLayout(
  input: LayoutInput,
  options: LayoutOptions = {}
): LayoutPositions {
  if (input.nodes.length === 0) return {}
  if (input.nodes.length === 1) return { [input.nodes[0].id]: { x: 0, y: 0 } }

  // Return placeholder positions - actual layout happens async
  return input.nodes.reduce((acc, node, i) => {
    acc[node.id] = { x: i * 200, y: 0 }
    return acc
  }, {} as LayoutPositions)
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
