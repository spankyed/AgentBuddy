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
  direction: LayoutDirection = 'LR',
  listenExitCounts: Map<string, number> = new Map()
): ElkNode {
  const { nodeWidth, nodeHeight, layerGap, nodeGap, chainGap } = LAYOUT_CONFIG

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
    } else if (isListen && listenExitCounts.has(node.id)) {
      // +1 matches ListenNode.vue which always renders one extra exit slot (maxIndex + 2)
      const visualExitCount = listenExitCount + 1
      const listenHeaderOffset = 43 + (node.eventType ? 29 : 0)
      height = Math.max(nodeHeight, listenHeaderOffset + visualExitCount * 22 + 10)
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
    } else if (isListen && listenExitCounts.has(node.id)) {
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

export async function calculateLayoutAsync(
  input: { nodes: LayoutNode[]; edges: LayoutEdge[] },
  options: { direction?: LayoutDirection } = {}
): Promise<LayoutPositions> {
  if (input.nodes.length === 0) return {}
  if (input.nodes.length === 1) return { [input.nodes[0].id]: { x: 0, y: 0 } }

  const direction = options.direction

  try {
    // Pre-compute listen exit counts from ALL edges (before filtering)
    const listenerNodeIds = new Set(
      input.nodes.filter(n => n.nodeType === 'listen').map(n => n.id)
    )
    const listenExitCounts = new Map<string, number>()
    for (const edge of input.edges) {
      if (listenerNodeIds.has(edge.source) && edge.sourceHandle) {
        const match = edge.sourceHandle.match(/exit-(\d+)/)
        if (match) {
          const idx = parseInt(match[1], 10)
          const prev = listenExitCounts.get(edge.source) ?? 0
          listenExitCounts.set(edge.source, Math.max(prev, idx + 1))
        }
      }
    }

    // Filter out edges targeting listener nodes (listeners have no input port)
    const filteredEdges = input.edges.filter(e => !listenerNodeIds.has(e.target))

    // Detect connected components via BFS on filtered edges
    const adj = new Map<string, Set<string>>()
    for (const node of input.nodes) adj.set(node.id, new Set())
    for (const e of filteredEdges) {
      adj.get(e.source)?.add(e.target)
      adj.get(e.target)?.add(e.source)
    }

    const visited = new Set<string>()
    const components: LayoutNode[][] = []
    for (const node of input.nodes) {
      if (visited.has(node.id)) continue
      const component: LayoutNode[] = []
      const queue = [node.id]
      visited.add(node.id)
      while (queue.length > 0) {
        const current = queue.shift()!
        const found = input.nodes.find(n => n.id === current)
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
