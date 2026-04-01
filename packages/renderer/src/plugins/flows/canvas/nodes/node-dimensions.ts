import type { ElkPort } from 'elkjs/lib/elk.bundled.js'

/** Shared between Vue components and layout engine — single source of truth */
export const NODE_DIMENSIONS = {
  default: { width: 200, height: 50 },
  listen: {
    rowHeight: 22,
    baseHeaderOffset: 43,
    eventTypeHeight: 29,
    bottomPadding: 10,
  },
  switch: {
    rowHeight: 26,
    headerOffset: 43,
    bottomPadding: 10,
  },
} as const

export interface LayoutNodeData {
  id: string
  nodeType?: string
  conditions?: Array<{ predicate?: unknown; label?: string }>
  eventType?: string
}

export interface DescriptorContext {
  exitCount?: number
}

export interface NodeLayoutDescriptor {
  getHeight(node: LayoutNodeData, context: DescriptorContext): number
  getPorts(node: LayoutNodeData, context: DescriptorContext): ElkPort[]
  hasInput: boolean
}

const { default: defaults } = NODE_DIMENSIONS

const defaultDescriptor: NodeLayoutDescriptor = {
  getHeight: () => defaults.height,
  getPorts: (node) => [
    { id: `${node.id}-in`, layoutOptions: { 'port.side': 'WEST' } },
    { id: `${node.id}-out`, layoutOptions: { 'port.side': 'EAST' } },
  ],
  hasInput: true,
}

const switchDescriptor: NodeLayoutDescriptor = {
  getHeight: (node) => {
    const branchCount = node.conditions?.length ?? 0
    const { headerOffset, rowHeight, bottomPadding } = NODE_DIMENSIONS.switch
    return Math.max(defaults.height, headerOffset + branchCount * rowHeight + bottomPadding)
  },
  getPorts: (node) => {
    const branchCount = node.conditions?.length ?? 0
    const ports: ElkPort[] = [
      { id: `${node.id}-in`, layoutOptions: { 'port.side': 'WEST' } },
    ]
    for (let i = 0; i < branchCount; i++) {
      ports.push({
        id: `${node.id}-out-branch-${i}`,
        layoutOptions: { 'port.side': 'EAST', 'port.index': String(i) },
      })
    }
    return ports
  },
  hasInput: true,
}

const listenDescriptor: NodeLayoutDescriptor = {
  getHeight: (node, ctx) => {
    const exitCount = ctx.exitCount
    if (exitCount === undefined) return defaults.height
    // +1 matches ListenNode.vue which always renders one extra exit slot (maxIndex + 2)
    const visualExitCount = exitCount + 1
    const { baseHeaderOffset, eventTypeHeight, rowHeight, bottomPadding } = NODE_DIMENSIONS.listen
    const headerOffset = baseHeaderOffset + (node.eventType ? eventTypeHeight : 0)
    return Math.max(defaults.height, headerOffset + visualExitCount * rowHeight + bottomPadding)
  },
  getPorts: (node, ctx) => {
    const exitCount = ctx.exitCount
    if (exitCount === undefined) {
      return [{ id: `${node.id}-out`, layoutOptions: { 'port.side': 'EAST' } }]
    }
    const ports: ElkPort[] = []
    for (let i = 0; i < exitCount; i++) {
      ports.push({
        id: `${node.id}-out-exit-${i}`,
        layoutOptions: { 'port.side': 'EAST', 'port.index': String(i) },
      })
    }
    return ports
  },
  hasInput: false,
}

const fireDescriptor: NodeLayoutDescriptor = {
  getHeight: () => defaults.height,
  getPorts: (node) => [
    { id: `${node.id}-in`, layoutOptions: { 'port.side': 'WEST' } },
  ],
  hasInput: true,
}

const nodeLayoutDescriptors = new Map<string, NodeLayoutDescriptor>([
  ['switch', switchDescriptor],
  ['listen', listenDescriptor],
  ['fire', fireDescriptor],
])

export function getDescriptor(nodeType?: string): NodeLayoutDescriptor {
  return nodeLayoutDescriptors.get(nodeType ?? '') ?? defaultDescriptor
}
