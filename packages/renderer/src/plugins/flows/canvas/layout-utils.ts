import ELK, { type ElkNode, type ElkExtendedEdge, type ElkPort } from 'elkjs/lib/elk.bundled.js'
import { NODE_DIMENSIONS, getDescriptor, type LayoutNodeData } from './nodes/node-dimensions'

export const LAYOUT_CONFIG = {
  nodeWidth: NODE_DIMENSIONS.default.width,
  nodeHeight: NODE_DIMENSIONS.default.height,
  layerGap: 20,
  nodeGap: 40,
  chainGap: 20,
  // Offset for positioning new nodes relative to source/selected node
  newNode: {
    xOffset: 200,
    yOffset: 0,
    defaultX: 0,
    defaultY: 0,
    fallbackX: 200,  // When source position not found
    fallbackY: 100,
  },
  edge: {
    maxBendOffset: 50,
    minBendOffset: 20,
    cornerRadius: 8,
    straightThreshold: 5,
    distanceNormalization: 200,
    anchorSpread: 15,  // Vertical spacing between anchor points for converging edges
  }
} as const

export type LayoutDirection = 'LR' | 'TB'
export type LayoutPositions = Record<string, { x: number; y: number }>

export type LayoutNode = LayoutNodeData

interface LayoutEdge {
  id?: string
  source: string
  target: string
  sourceHandle?: string
}

const elk = new ELK()

/** Parse a handle string like "branch-2" or "exit-0" into its prefix and index */
export function parseHandleIndex(handle?: string): { prefix: string; index: number } | null {
  const match = handle?.match(/(branch|exit)-(\d+)/)
  return match ? { prefix: match[1], index: parseInt(match[2], 10) } : null
}

/** Build an ELK port ID from a node ID and optional handle */
export function buildPortId(nodeId: string, handle?: string): string {
  return handle ? `${nodeId}-out-${handle}` : `${nodeId}-out`
}

const getHandleIndex = (handle?: string): number => {
  return parseHandleIndex(handle)?.index ?? 0
}

// --- Component detection ---

interface LayoutComponents {
  components: LayoutNode[][]
  filteredEdges: LayoutEdge[]
  listenExitCounts: Map<string, number>
}

export function partitionIntoComponents(
  nodes: LayoutNode[],
  edges: LayoutEdge[]
): LayoutComponents {
  // Pre-compute listen exit counts from ALL edges (before filtering)
  const listenerNodeIds = new Set(
    nodes.filter(n => n.nodeType === 'listen').map(n => n.id)
  )
  const listenExitCounts = new Map<string, number>()
  for (const edge of edges) {
    if (listenerNodeIds.has(edge.source) && edge.sourceHandle) {
      const parsed = parseHandleIndex(edge.sourceHandle)
      if (parsed) {
        const prev = listenExitCounts.get(edge.source) ?? 0
        listenExitCounts.set(edge.source, Math.max(prev, parsed.index + 1))
      }
    }
  }

  // Filter out edges targeting listener nodes (listeners have no input port)
  const filteredEdges = edges.filter(e => !listenerNodeIds.has(e.target))

  // Detect connected components via BFS on filtered edges
  const adj = new Map<string, Set<string>>()
  for (const node of nodes) adj.set(node.id, new Set())
  for (const e of filteredEdges) {
    adj.get(e.source)?.add(e.target)
    adj.get(e.target)?.add(e.source)
  }

  const visited = new Set<string>()
  const components: LayoutNode[][] = []
  for (const node of nodes) {
    if (visited.has(node.id)) continue
    const component: LayoutNode[] = []
    const queue = [node.id]
    visited.add(node.id)
    while (queue.length > 0) {
      const current = queue.shift()!
      const found = nodes.find(n => n.id === current)
      if (found) component.push(found)
      for (const neighbor of adj.get(current) ?? []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor)
          queue.push(neighbor)
        }
      }
    }
    components.push(component)
  }

  return { components, filteredEdges, listenExitCounts }
}

// --- ELK graph construction (node-type-agnostic via descriptors) ---

export function buildElkGraph(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  direction: LayoutDirection = 'LR',
  listenExitCounts: Map<string, number> = new Map()
): ElkNode {
  const { nodeWidth, layerGap, nodeGap, chainGap } = LAYOUT_CONFIG

  const elkNodes: ElkNode[] = nodes.map((node) => {
    const descriptor = getDescriptor(node.nodeType)
    const exitCount = listenExitCounts.has(node.id) ? listenExitCounts.get(node.id) : undefined
    const ctx = { exitCount }

    const height = descriptor.getHeight(node, ctx)
    const ports: ElkPort[] = descriptor.getPorts(node, ctx)

    return { id: node.id, width: nodeWidth, height, ports }
  })

  const sortedEdges = [...edges].sort((a, b) =>
    getHandleIndex(a.sourceHandle) - getHandleIndex(b.sourceHandle)
  )

  const elkEdges: ElkExtendedEdge[] = sortedEdges.map((edge, idx) => ({
    id: edge.id || `e${idx}`,
    sources: [buildPortId(edge.source, edge.sourceHandle)],
    targets: [`${edge.target}-in`],
    layoutOptions: { 'elk.priority': String(getHandleIndex(edge.sourceHandle)) }
  }))

  return {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': direction === 'LR' ? 'RIGHT' : 'DOWN',
      'elk.layered.spacing.nodeNodeBetweenLayers': String(layerGap),
      'elk.spacing.nodeNode': String(nodeGap),
      'elk.separateConnectedComponents': 'false',
      'elk.spacing.componentComponent': String(chainGap),
      'elk.portConstraints': 'FIXED_ORDER',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.layered.crossingMinimization.forceNodeModelOrder': 'true',
      'elk.layered.considerModelOrder.strategy': 'PREFER_EDGES',
      'elk.layered.nodePlacement.strategy': 'LINEAR_SEGMENTS',
      'elk.edgeRouting': 'SPLINES',
    },
    children: elkNodes,
    edges: elkEdges
  }
}

// --- Main layout orchestration ---

export async function calculateLayoutAsync(
  input: { nodes: LayoutNode[]; edges: LayoutEdge[] },
  options: { direction?: LayoutDirection } = {}
): Promise<LayoutPositions> {
  if (input.nodes.length === 0) return {}
  if (input.nodes.length === 1) return { [input.nodes[0].id]: { x: 0, y: 0 } }

  const direction = options.direction

  try {
    const { components, filteredEdges, listenExitCounts } =
      partitionIntoComponents(input.nodes, input.edges)

    // Layout each component independently and stack vertically
    const positions: LayoutPositions = {}

    if (components.length <= 1) {
      const graph = await elk.layout(
        buildElkGraph(input.nodes, filteredEdges, direction, listenExitCounts)
      )
      for (const child of graph.children ?? []) {
        if (child.id && child.x !== undefined && child.y !== undefined) {
          positions[child.id] = { x: child.x, y: child.y }
        }
      }
    } else {
      let yOffset = 0
      for (const comp of components) {
        const compNodeIds = new Set(comp.map(n => n.id))
        const compEdges = filteredEdges.filter(
          e => compNodeIds.has(e.source) || compNodeIds.has(e.target)
        )
        const graph = await elk.layout(
          buildElkGraph(comp, compEdges, direction, listenExitCounts)
        )
        let maxBottom = 0
        for (const child of graph.children ?? []) {
          if (child.id && child.x !== undefined && child.y !== undefined) {
            positions[child.id] = { x: child.x, y: child.y + yOffset }
            const bottom = child.y + (child.height ?? LAYOUT_CONFIG.nodeHeight)
            if (bottom > maxBottom) maxBottom = bottom
          }
        }
        yOffset += maxBottom + LAYOUT_CONFIG.chainGap
      }
    }

    return positions
  } catch (error) {
    console.error('ELK layout failed:', error)
    return Object.fromEntries(input.nodes.map((n, i) => [n.id, { x: i * 200, y: 0 }]))
  }
}

export function allNodesHavePositions(
  nodes: { id: string }[],
  positions: LayoutPositions
): boolean {
  return nodes.every(n => positions[n.id]?.x !== undefined && positions[n.id]?.y !== undefined)
}
