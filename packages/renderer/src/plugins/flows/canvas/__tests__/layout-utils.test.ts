import { describe, it, expect } from 'vitest'
import { NODE_DIMENSIONS, getDescriptor } from '../nodes/node-dimensions'
import type { LayoutNodeData } from '../nodes/node-dimensions'
import {
  parseHandleIndex,
  buildPortId,
  partitionIntoComponents,
  buildElkGraph,
} from '../layout-utils'

// --- parseHandleIndex ---

describe('parseHandleIndex', () => {
  it('parses branch handles', () => {
    expect(parseHandleIndex('branch-0')).toEqual({ prefix: 'branch', index: 0 })
    expect(parseHandleIndex('branch-5')).toEqual({ prefix: 'branch', index: 5 })
  })

  it('parses exit handles', () => {
    expect(parseHandleIndex('exit-0')).toEqual({ prefix: 'exit', index: 0 })
    expect(parseHandleIndex('exit-12')).toEqual({ prefix: 'exit', index: 12 })
  })

  it('returns null for undefined or unrecognized handles', () => {
    expect(parseHandleIndex(undefined)).toBeNull()
    expect(parseHandleIndex('')).toBeNull()
    expect(parseHandleIndex('output')).toBeNull()
    expect(parseHandleIndex('branch-')).toBeNull()
  })

  it('matches handle patterns anywhere in the string', () => {
    expect(parseHandleIndex('prefix-branch-0')).toEqual({ prefix: 'branch', index: 0 })
    expect(parseHandleIndex('exit-0-suffix')).toEqual({ prefix: 'exit', index: 0 })
  })
})

// --- buildPortId ---

describe('buildPortId', () => {
  it('builds a simple output port when no handle', () => {
    expect(buildPortId('node1')).toBe('node1-out')
    expect(buildPortId('node1', undefined)).toBe('node1-out')
  })

  it('builds a handle-qualified port', () => {
    expect(buildPortId('node1', 'branch-0')).toBe('node1-out-branch-0')
    expect(buildPortId('node1', 'exit-2')).toBe('node1-out-exit-2')
  })

  it('round-trips with parseHandleIndex', () => {
    const handle = 'exit-3'
    const portId = buildPortId('n1', handle)
    expect(portId).toBe('n1-out-exit-3')
    // The handle portion can be recovered
    const handlePart = portId.replace('n1-out-', '')
    expect(parseHandleIndex(handlePart)).toEqual({ prefix: 'exit', index: 3 })
  })
})

// --- Height calculations via descriptors ---

describe('node height calculations', () => {
  const defaultHeight = NODE_DIMENSIONS.default.height

  it('default nodes return default height', () => {
    const node: LayoutNodeData = { id: 'n1', nodeType: 'action' }
    const descriptor = getDescriptor('action')
    expect(descriptor.getHeight(node, {})).toBe(defaultHeight)
  })

  it('switch node height scales with branch count', () => {
    const descriptor = getDescriptor('switch')
    const { headerOffset, rowHeight, bottomPadding } = NODE_DIMENSIONS.switch

    const node2: LayoutNodeData = { id: 'n1', nodeType: 'switch', conditions: [{}, {}] }
    expect(descriptor.getHeight(node2, {})).toBe(
      Math.max(defaultHeight, headerOffset + 2 * rowHeight + bottomPadding)
    )

    const node5: LayoutNodeData = { id: 'n2', nodeType: 'switch', conditions: [{}, {}, {}, {}, {}] }
    expect(descriptor.getHeight(node5, {})).toBe(headerOffset + 5 * rowHeight + bottomPadding)
  })

  it('switch node with zero conditions returns header + padding height', () => {
    const descriptor = getDescriptor('switch')
    const { headerOffset, bottomPadding } = NODE_DIMENSIONS.switch
    const node: LayoutNodeData = { id: 'n1', nodeType: 'switch', conditions: [] }
    expect(descriptor.getHeight(node, {})).toBe(
      Math.max(defaultHeight, headerOffset + bottomPadding)
    )
  })

  it('listener node height scales with exit count', () => {
    const descriptor = getDescriptor('listener')
    const { baseHeaderOffset, rowHeight, bottomPadding } = NODE_DIMENSIONS.listener

    const node: LayoutNodeData = { id: 'n1', nodeType: 'listener' }
    // exitCount=3 → visualExitCount=4
    const height = descriptor.getHeight(node, { exitCount: 3 })
    expect(height).toBe(Math.max(defaultHeight, baseHeaderOffset + 4 * rowHeight + bottomPadding))
  })

  it('listener node with eventType adds extra height', () => {
    const descriptor = getDescriptor('listener')
    const { baseHeaderOffset, eventTypeHeight, rowHeight, bottomPadding } = NODE_DIMENSIONS.listener

    const node: LayoutNodeData = { id: 'n1', nodeType: 'listener', eventType: 'user.created' }
    const height = descriptor.getHeight(node, { exitCount: 2 })
    const headerOffset = baseHeaderOffset + eventTypeHeight
    expect(height).toBe(Math.max(defaultHeight, headerOffset + 3 * rowHeight + bottomPadding))
  })

  it('listener node without exitCount returns default height', () => {
    const descriptor = getDescriptor('listener')
    const node: LayoutNodeData = { id: 'n1', nodeType: 'listener' }
    expect(descriptor.getHeight(node, {})).toBe(defaultHeight)
  })

  it('fire node returns default height', () => {
    const descriptor = getDescriptor('fire')
    const node: LayoutNodeData = { id: 'n1', nodeType: 'fire' }
    expect(descriptor.getHeight(node, {})).toBe(defaultHeight)
  })
})

// --- Port generation via descriptors ---

describe('node port generation', () => {
  it('default node has input and single output port', () => {
    const descriptor = getDescriptor('action')
    const ports = descriptor.getPorts({ id: 'n1', nodeType: 'action' }, {})
    expect(ports).toHaveLength(2)
    expect(ports[0].id).toBe('n1-in')
    expect(ports[1].id).toBe('n1-out')
  })

  it('switch node has input + one output per branch', () => {
    const descriptor = getDescriptor('switch')
    const node: LayoutNodeData = { id: 'n1', nodeType: 'switch', conditions: [{}, {}, {}] }
    const ports = descriptor.getPorts(node, {})
    expect(ports).toHaveLength(4) // 1 input + 3 branches
    expect(ports[0].id).toBe('n1-in')
    expect(ports[1].id).toBe('n1-out-branch-0')
    expect(ports[2].id).toBe('n1-out-branch-1')
    expect(ports[3].id).toBe('n1-out-branch-2')
  })

  it('listener node has no input port and exit ports matching exitCount', () => {
    const descriptor = getDescriptor('listener')
    expect(descriptor.hasInput).toBe(false)
    const ports = descriptor.getPorts({ id: 'n1', nodeType: 'listener' }, { exitCount: 2 })
    expect(ports).toHaveLength(2)
    expect(ports[0].id).toBe('n1-out-exit-0')
    expect(ports[1].id).toBe('n1-out-exit-1')
  })

  it('listener node without exitCount returns single default output port', () => {
    const descriptor = getDescriptor('listener')
    const ports = descriptor.getPorts({ id: 'n1', nodeType: 'listener' }, {})
    expect(ports).toHaveLength(1)
    expect(ports[0].id).toBe('n1-out')
    expect(ports[0].layoutOptions!['port.side']).toBe('EAST')
  })

  it('fire node has input but no output port', () => {
    const descriptor = getDescriptor('fire')
    const ports = descriptor.getPorts({ id: 'n1', nodeType: 'fire' }, {})
    expect(ports).toHaveLength(1)
    expect(ports[0].id).toBe('n1-in')
  })

  it('edge port refs match declared port IDs for switch', () => {
    const node: LayoutNodeData = { id: 's1', nodeType: 'switch', conditions: [{}, {}] }
    const edges = [
      { source: 's1', target: 't1', sourceHandle: 'branch-0' },
      { source: 's1', target: 't2', sourceHandle: 'branch-1' },
    ]
    const graph = buildElkGraph([node, { id: 't1' }, { id: 't2' }], edges, 'LR')
    const switchNode = graph.children!.find(c => c.id === 's1')!
    const portIds = new Set(switchNode.ports!.map(p => p.id))
    for (const edge of graph.edges!) {
      for (const src of (edge as any).sources) {
        if (src.startsWith('s1')) {
          expect(portIds.has(src)).toBe(true)
        }
      }
    }
  })
})

// --- Component detection ---

describe('partitionIntoComponents', () => {
  it('puts connected nodes in same component', () => {
    const nodes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    const edges = [
      { source: 'a', target: 'b' },
      { source: 'b', target: 'c' },
    ]
    const result = partitionIntoComponents(nodes, edges)
    expect(result.components).toHaveLength(1)
    expect(result.components[0]).toHaveLength(3)
  })

  it('separates disconnected nodes into components', () => {
    const nodes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]
    const edges = [
      { source: 'a', target: 'b' },
      { source: 'c', target: 'd' },
    ]
    const result = partitionIntoComponents(nodes, edges)
    expect(result.components).toHaveLength(2)
    expect(result.components[0].map(n => n.id)).toEqual(['a', 'b'])
    expect(result.components[1].map(n => n.id)).toEqual(['c', 'd'])
  })

  it('excludes edges targeting listener nodes from filtered edges', () => {
    const nodes = [
      { id: 'listen1', nodeType: 'listener' },
      { id: 'action1' },
      { id: 'action2' },
    ]
    const edges = [
      { source: 'action1', target: 'listen1' },
      { source: 'listen1', target: 'action2', sourceHandle: 'exit-0' },
    ]
    const result = partitionIntoComponents(nodes, edges)
    // Edge targeting listen1 should be filtered out
    expect(result.filteredEdges).toHaveLength(1)
    expect(result.filteredEdges[0].target).toBe('action2')
  })

  it('computes listener exit counts from edges', () => {
    const nodes = [
      { id: 'listen1', nodeType: 'listener' },
      { id: 'a' },
      { id: 'b' },
    ]
    const edges = [
      { source: 'listen1', target: 'a', sourceHandle: 'exit-0' },
      { source: 'listen1', target: 'b', sourceHandle: 'exit-2' },
    ]
    const result = partitionIntoComponents(nodes, edges)
    // Max index is 2, so count = 2+1 = 3
    expect(result.listenerExitCounts.get('listen1')).toBe(3)
  })

  it('handles nodes with no edges', () => {
    const nodes = [{ id: 'a' }, { id: 'b' }]
    const result = partitionIntoComponents(nodes, [])
    expect(result.components).toHaveLength(2)
    expect(result.components[0]).toHaveLength(1)
    expect(result.components[1]).toHaveLength(1)
  })
})

// --- buildElkGraph structure ---

describe('buildElkGraph', () => {
  it('produces correct number of children and edges', () => {
    const nodes: LayoutNodeData[] = [{ id: 'a' }, { id: 'b' }]
    const edges = [{ source: 'a', target: 'b' }]
    const graph = buildElkGraph(nodes, edges)
    expect(graph.children).toHaveLength(2)
    expect(graph.edges).toHaveLength(1)
  })

  it('uses NODE_DIMENSIONS.default.width for all nodes', () => {
    const nodes: LayoutNodeData[] = [
      { id: 'a' },
      { id: 'b', nodeType: 'switch', conditions: [{}] },
    ]
    const graph = buildElkGraph(nodes, [])
    for (const child of graph.children!) {
      expect(child.width).toBe(NODE_DIMENSIONS.default.width)
    }
  })

  it('sets direction based on parameter', () => {
    const graph = buildElkGraph([{ id: 'a' }], [], 'TB')
    expect(graph.layoutOptions!['elk.direction']).toBe('DOWN')
  })

  it('listener node with no exit edges gets default output port matching edge refs', () => {
    const nodes: LayoutNodeData[] = [
      { id: 'listen1', nodeType: 'listener' },
      { id: 'action1' },
    ]
    // Edge references the default "listen1-out" port (no sourceHandle → buildPortId returns "listen1-out")
    const edges = [{ source: 'listen1', target: 'action1' }]
    const graph = buildElkGraph(nodes, edges, 'LR')

    const listenNode = graph.children!.find(c => c.id === 'listen1')!
    const portIds = new Set(listenNode.ports!.map(p => p.id))
    expect(portIds.has('listen1-out')).toBe(true)

    // The edge source should reference an existing port
    for (const edge of graph.edges!) {
      for (const src of (edge as any).sources) {
        if (src.startsWith('listen1')) {
          expect(portIds.has(src)).toBe(true)
        }
      }
    }
  })
})
