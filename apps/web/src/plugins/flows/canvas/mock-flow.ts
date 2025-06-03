const nowMs = Date.now();

export const dialogRows = {
  entity: [
    { id: 'Graph-1', entityType: 'Graph', createdAt: nowMs, name: 'Example Dialog' },

    /* nodes ---------------------------------------------------- */
    { id: 'Node-1', entityType: 'Node', createdAt: nowMs, nodeType: 'input', label: 'User Input', x: 120, y: 80 },
    { id: 'Node-2', entityType: 'Node', createdAt: nowMs, nodeType: 'transform', label: 'Parse Intent', x: 320, y: 160 },
    { id: 'Node-3', entityType: 'Node', createdAt: nowMs, nodeType: 'llm', label: 'LLM Call', prompt: 'Generate a helpful response using {{intent}}', x: 520, y: 160 },
    { id: 'Node-4', entityType: 'Node', createdAt: nowMs, nodeType: 'output', label: 'Summarize', x: 720, y: 240 },

    /* event topic --------------------------------------------- */
    { id: 'Event-1', entityType: 'Event', createdAt: nowMs, eventName: 'orderPlaced', color: 'purple' },
  ],

  role: [
    { entityId: 'Node-2', role: 'selected_node' },
    { entityId: 'Node-3', role: 'latest_node' },
  ],

  relation: [
    /* containment (not rendered on the canvas) */
    { srcId: 'Graph-1', kind: 'CONTAINS', tgtId: 'Node-1', info: '{}' },
    { srcId: 'Graph-1', kind: 'CONTAINS', tgtId: 'Node-2', info: '{}' },
    { srcId: 'Graph-1', kind: 'CONTAINS', tgtId: 'Node-3', info: '{}' },
    { srcId: 'Graph-1', kind: 'CONTAINS', tgtId: 'Node-4', info: '{}' },
    { srcId: 'Graph-1', kind: 'CONTAINS', tgtId: 'Event-1', info: '{}' },

    /* solid data-flow edges */
    { srcId: 'Node-1', kind: 'FLOW', tgtId: 'Node-2', info: '{}' },
    { srcId: 'Node-2', kind: 'FLOW', tgtId: 'Node-3', info: '{}' },
    { srcId: 'Node-3', kind: 'FLOW', tgtId: 'Node-4', info: '{}' },

    /* event wiring (dashed) */
    { srcId: 'Node-2', kind: 'EMITS', tgtId: 'Event-1', info: '{}' },
    { srcId: 'Event-1', kind: 'CONSUMED_BY', tgtId: 'Node-3', info: '{}' },
  ],
} as const;