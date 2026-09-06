import type { ElkPort } from 'elkjs/lib/elk.bundled.js'
import { stepRegistry } from '@abuddy/sdk/steps'
import { NODE_DIMENSIONS } from '@abuddy/sdk/fe/components/node-dimensions'

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
  /** When true, computeMaxBottom derives exit count from edges for this descriptor */
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

/** Trigger nodes: no input handle, dynamic exit handles derived from edges */
const triggerDescriptor: NodeLayoutDescriptor = {
  usesExitCount: true,
  getHeight: (node, ctx) => {
    const exitCount = ctx.exitCount
    if (exitCount === undefined) return defaults.height
    // +1 matches TriggerNode.vue which always renders one extra exit slot (maxIndex + 2)
    const visualExitCount = exitCount + 1
    const { baseHeaderOffset, eventTypeHeight, rowHeight, bottomPadding } = NODE_DIMENSIONS.listener
    const hasSubtitle = !!(node.eventType || node.cronExpression)
    const headerOffset = baseHeaderOffset + (hasSubtitle ? eventTypeHeight : 0)
    return Math.max(defaults.height, headerOffset + visualExitCount * rowHeight + bottomPadding)
  },
  getPorts: (node, ctx) => {
    const exitCount = ctx.exitCount
    // No exit edges yet — provide a default output port so edges
    // referencing "nodeId-out" still resolve and ELK doesn't throw.
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

export function getDescriptor(nodeType?: string): NodeLayoutDescriptor {
  if (!nodeType) return defaultDescriptor;
  if (stepRegistry.isTrigger(nodeType)) {
    const layout = stepRegistry.getFE(nodeType)?.layout;
    if (layout) {
      return {
        getHeight: layout.getHeight
          ? (node, ctx) => layout.getHeight!(node as any, ctx)
          : triggerDescriptor.getHeight,
        getPorts: layout.getPorts
          ? (node, ctx) => layout.getPorts!(node as any, ctx) as ElkPort[]
          : triggerDescriptor.getPorts,
        hasInput: false,
        usesExitCount: layout.usesExitCount ?? triggerDescriptor.usesExitCount,
      };
    }
    return triggerDescriptor;
  }
  const layout = stepRegistry.getFE(nodeType)?.layout;
  if (layout) {
    return {
      getHeight: layout.getHeight
        ? (node, ctx) => layout.getHeight!(node as any, ctx)
        : defaultDescriptor.getHeight,
      getPorts: layout.getPorts
        ? (node, ctx) => layout.getPorts!(node as any, ctx) as ElkPort[]
        : defaultDescriptor.getPorts,
      hasInput: layout.hasInput ?? true,
      usesExitCount: layout.usesExitCount,
    };
  }
  return defaultDescriptor;
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
