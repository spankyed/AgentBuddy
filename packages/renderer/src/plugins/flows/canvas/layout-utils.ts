import ELK, { type ElkNode, type ElkExtendedEdge, type ElkPort } from 'elkjs/lib/elk.bundled.js'

export const LAYOUT_CONFIG = {
  nodeWidth: 200,
  nodeHeight: 50,
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

interface LayoutNode {
  id: string
  nodeType?: string
  conditions?: Array<{ predicate?: unknown; label?: string }>
  eventType?: string
}

interface LayoutEdge {
  id?: string
  source: string
  target: string
  sourceHandle?: string
}

const elk = new ELK()

const getHandleIndex = (handle?: string): number => {
  const match = handle?.match(/(?:branch|exit)-(\d+)/)
  return match ? parseInt(match[1], 10) : 0
}

function buildElkGraph(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  direction: LayoutDirection = 'LR'
): ElkNode {
  const { nodeWidth, nodeHeight, layerGap, nodeGap, chainGap } = LAYOUT_CONFIG

  // Count exit handles per listen node from edges
  const listenExitCounts = new Map<string, number>()
  for (const edge of edges) {
    const sourceNode = nodes.find(n => n.id === edge.source)
    if (sourceNode?.nodeType === 'listen' && edge.sourceHandle) {
      const match = edge.sourceHandle.match(/exit-(\d+)/)
      if (match) {
        const idx = parseInt(match[1], 10)
        const prev = listenExitCounts.get(edge.source) ?? 0
        listenExitCounts.set(edge.source, Math.max(prev, idx + 1))
      }
    }
  }

  const elkNodes: ElkNode[] = nodes.map((node) => {
    const ports: ElkPort[] = []
    const isSwitch = node.nodeType === 'switch'
    const isListen = node.nodeType === 'listen'
    const branchCount = node.conditions?.length ?? 0
    const listenExitCount = listenExitCounts.get(node.id) ?? 1

    // Calculate height
    // Constants must match SwitchNode.vue: HEADER_OFFSET=43, ROW_HEIGHT=26, bottom padding=10
    // Listen node constants: HEADER_OFFSET=43, ROW_HEIGHT=22, bottom padding=10
    let height: number = nodeHeight
    if (isSwitch) {
      height = Math.max(nodeHeight, 43 + branchCount * 26 + 10)
    } else if (isListen && listenExitCount > 1) {
      // Constants must match ListenNode.vue: BASE_HEADER_OFFSET=43, EVENT_TYPE_HEIGHT=29, ROW_HEIGHT=22, bottom padding=10
      const listenHeaderOffset = 43 + (node.eventType ? 29 : 0)
      height = Math.max(nodeHeight, listenHeaderOffset + listenExitCount * 22 + 10)
    }

    // Single input port (except for listen nodes)
    if (!isListen) {
      ports.push({ id: `${node.id}-in`, layoutOptions: { 'port.side': 'WEST' } })
    }

    // Output ports - multiple for switch and listen (multi-exit), single for others
    if (isSwitch) {
      for (let i = 0; i < branchCount; i++) {
        ports.push({
          id: `${node.id}-out-branch-${i}`,
          layoutOptions: { 'port.side': 'EAST', 'port.index': String(i) }
        })
      }
    } else if (isListen && listenExitCount > 1) {
      for (let i = 0; i < listenExitCount; i++) {
        ports.push({
          id: `${node.id}-out-exit-${i}`,
          layoutOptions: { 'port.side': 'EAST', 'port.index': String(i) }
        })
      }
    } else if (node.nodeType !== 'fire') {
      ports.push({ id: `${node.id}-out`, layoutOptions: { 'port.side': 'EAST' } })
    }

    return { id: node.id, width: nodeWidth, height, ports }
  })

  const sortedEdges = [...edges].sort((a, b) =>
    getHandleIndex(a.sourceHandle) - getHandleIndex(b.sourceHandle)
  )

  const elkEdges: ElkExtendedEdge[] = sortedEdges.map((edge, idx) => {
    const sourcePort = edge.sourceHandle
      ? `${edge.source}-out-${edge.sourceHandle}`
      : `${edge.source}-out`

    return {
      id: edge.id || `e${idx}`,
      sources: [sourcePort],
      targets: [`${edge.target}-in`],
      layoutOptions: { 'elk.priority': String(getHandleIndex(edge.sourceHandle)) }
    }
  })

  return {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': direction === 'LR' ? 'RIGHT' : 'DOWN',
      'elk.layered.spacing.nodeNodeBetweenLayers': String(layerGap),
      'elk.spacing.nodeNode': String(nodeGap),
      'elk.separateConnectedComponents': 'true',
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

export async function calculateLayoutAsync(
  input: { nodes: LayoutNode[]; edges: LayoutEdge[] },
  options: { direction?: LayoutDirection } = {}
): Promise<LayoutPositions> {
  if (input.nodes.length === 0) return {}
  if (input.nodes.length === 1) return { [input.nodes[0].id]: { x: 0, y: 0 } }

  try {
    const graph = await elk.layout(buildElkGraph(input.nodes, input.edges, options.direction))
    const positions: LayoutPositions = {}
    for (const child of graph.children ?? []) {
      if (child.id && child.x !== undefined && child.y !== undefined) {
        positions[child.id] = { x: child.x, y: child.y }
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
