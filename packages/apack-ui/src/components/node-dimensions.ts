import type { ElkPort } from 'elkjs/lib/elk.bundled.js'
import { getStepDeclaration, getStepBinding } from '@apackdev/sdk/fe'

export const NODE_DIMENSIONS = {
  default: { width: 200, height: 50 },
  listener: {
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
  cronExpression?: string
}

export interface DescriptorContext {
  exitCount?: number
}

export interface NodeLayoutDescriptor {
  getHeight(node: LayoutNodeData, context: DescriptorContext): number
  getPorts(node: LayoutNodeData, context: DescriptorContext): ElkPort[]
  hasInput: boolean
  usesExitCount?: boolean
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

const triggerDescriptor: NodeLayoutDescriptor = {
  usesExitCount: true,
  getHeight: (node, ctx) => {
    const exitCount = ctx.exitCount
    if (exitCount === undefined) return defaults.height
    const visualExitCount = exitCount + 1
    const { baseHeaderOffset, eventTypeHeight, rowHeight, bottomPadding } = NODE_DIMENSIONS.listener
    const hasSubtitle = !!(node.eventType || node.cronExpression)
    const headerOffset = baseHeaderOffset + (hasSubtitle ? eventTypeHeight : 0)
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

/** Static flags remain available; callbacks require the same currently eligible binding. */
export function getDescriptor(nodeType?: string): NodeLayoutDescriptor {
  if (!nodeType) return defaultDescriptor
  const declaration = getStepDeclaration(nodeType)?.declaration
  const base = declaration?.kind === 'trigger' ? triggerDescriptor : defaultDescriptor
  const layout = declaration?.fe?.layout
  const accepted = getStepBinding(nodeType)
  const currentLayout = () => accepted && getStepBinding(nodeType) === accepted ? accepted.binding.fe?.layout : undefined
  return {
    getHeight: (node, context) => currentLayout()?.getHeight?.(node as unknown as Record<string, unknown>, context)
      ?? base.getHeight(node, context),
    getPorts: (node, context) => currentLayout()?.getPorts?.(node as unknown as Record<string, unknown>, context)
      ?? base.getPorts(node, context),
    hasInput: layout?.hasInput ?? base.hasInput,
    usesExitCount: layout?.usesExitCount ?? base.usesExitCount,
  }
}

export function computeExitCount(
  nodeId: string,
  edges: ReadonlyArray<{ source: string; sourceHandle?: string }>
): number | undefined {
  let maxIndex = -1
  for (const edge of edges) {
    if (edge.source !== nodeId || !edge.sourceHandle) continue
    const match = edge.sourceHandle.match(/exit-(\d+)/)
    if (match) maxIndex = Math.max(maxIndex, parseInt(match[1], 10))
  }
  return maxIndex >= 0 ? maxIndex + 1 : undefined
}

export function computeMaxBottom(
  nodes: ReadonlyArray<LayoutNodeData>,
  positions: Readonly<Record<string, { x: number; y: number }>>,
  edges: ReadonlyArray<{ source: string; sourceHandle?: string }>
): number {
  let maxBottom = 0
  for (const node of nodes) {
    const pos = positions[node.id]
    if (!pos) continue
    const descriptor = getDescriptor(node.nodeType)
    const exitCount = descriptor.usesExitCount ? computeExitCount(node.id, edges) : undefined
    const height = descriptor.getHeight(node, { exitCount })
    const bottom = pos.y + height
    if (bottom > maxBottom) maxBottom = bottom
  }
  return maxBottom
}
