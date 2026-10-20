import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createActor } from 'xstate';
import { answerTo, startFeTestRuntime } from '@apackdev/sdk/testing';
import type { NodeEntity } from '#generated/types.ts';
import { sentCall } from '../../../_support/calls.ts';

const sendToSystem = vi.hoisted(() => vi.fn());
const layouts = vi.hoisted(() => [] as Array<(positions: Record<string, { x: number; y: number }>) => void>);
vi.mock('#generated/events.ts', () => ({ sendToSystem }));
vi.mock('#features/flows/fe/canvas/layout-utils.ts', async original => ({
  ...await original<typeof import('#features/flows/fe/canvas/layout-utils.ts')>(),
  calculateLayoutAsync: vi.fn(() => new Promise<Record<string, { x: number; y: number }>>(resolve => layouts.push(resolve))),
}));
const { default: flowsState } = await import('#features/flows/fe/state.ts');
const actors: ReturnType<typeof createActor<typeof flowsState>>[] = [];
const view = () => { const actor = createActor(flowsState).start(); actors.push(actor); return actor; };
const graph = (id: `Node-${string}`) => ({ nodes: [{ id, entityType: 'Node', createdAt: 1, nodeType: 'listener', label: id, scope: 'entry', eventType: 'flow.entry' } satisfies NodeEntity], edges: [] });
const selected = (flowId: `Flow-${string}`, nodeId: `Node-${string}`) => ({ type: 'FLOW_SELECTED' as const, flowId, data: graph(nodeId) });
beforeEach(() => { sendToSystem.mockReset(); layouts.length = 0; });
afterEach(() => actors.splice(0).forEach(actor => actor.stop()));

it('reveals the requested blueprint node only after its matching graph arrives', () => {
  const actor = view();
  actor.send({ type: 'NODE.REVEAL', flowId: 'Flow-first', nodeId: 'Node-first' });
  const call = sentCall(sendToSystem, 'FLOW_SELECT');
  expect(actor.getSnapshot().context.editingNodeId).toBeUndefined();
  actor.send(selected('Flow-first', 'Node-first'));
  expect(actor.getSnapshot().context.selectedFlowId).toBeUndefined();
  actor.send(answerTo(call, selected('Flow-first', 'Node-first')));
  expect(actor.getSnapshot().context).toMatchObject({ selectedFlowId: 'Flow-first', editingNodeId: 'Node-first', selectedNodeId: 'Node-first' });
  expect(actor.getSnapshot().matches('view')).toBe(true);
});

it('does not let a superseded graph reply replace the requested node or flow', () => {
  const actor = view();
  actor.send({ type: 'NODE.REVEAL', flowId: 'Flow-first', nodeId: 'Node-first' });
  const abandoned = sentCall(sendToSystem, 'FLOW_SELECT');
  actor.send({ type: 'NODE.REVEAL', flowId: 'Flow-second', nodeId: 'Node-second' });
  const current = sentCall(sendToSystem, 'FLOW_SELECT', 1);
  actor.send(answerTo(current, selected('Flow-second', 'Node-second')));
  actor.send(answerTo(abandoned, selected('Flow-first', 'Node-first')));
  expect(actor.getSnapshot().context).toMatchObject({ selectedFlowId: 'Flow-second', editingNodeId: 'Node-second' });
});

it('reveals immediately when the requested node is already in the loaded graph', () => {
  const actor = view();
  actor.send({ type: 'OPEN_ENTITY', id: 'Flow-first' });
  actor.send(answerTo(sentCall(sendToSystem, 'FLOW_SELECT'), selected('Flow-first', 'Node-first')));
  sendToSystem.mockClear();
  actor.send({ type: 'NODE.REVEAL', flowId: 'Flow-first', nodeId: 'Node-first' });
  expect(actor.getSnapshot().context.editingNodeId).toBe('Node-first');
  expect(sendToSystem).not.toHaveBeenCalled();
});

it.each(['leave', 'list'] as const)('ignores a reply after navigating to %s', where => {
  const actor = view();
  actor.send({ type: 'NODE.REVEAL', flowId: 'Flow-first', nodeId: 'Node-first' });
  const call = sentCall(sendToSystem, 'FLOW_SELECT');
  if (where === 'leave') actor.send({ type: 'PLUGIN_DEACTIVATED' });
  else actor.send({ type: 'TRAIL_CLICK', target: 'list' });
  actor.send(answerTo(call, selected('Flow-first', 'Node-first')));
  expect(actor.getSnapshot().context.selectedFlowId).toBeUndefined();
  expect(actor.getSnapshot().context.editingNodeId).toBeUndefined();
});

it('refreshes a loaded graph before reporting a node missing, without editing another node', () => {
  const actor = view();
  actor.send({ type: 'OPEN_ENTITY', id: 'Flow-first' });
  actor.send(answerTo(sentCall(sendToSystem, 'FLOW_SELECT'), selected('Flow-first', 'Node-first')));
  actor.send({ type: 'NODE.REVEAL', flowId: 'Flow-first', nodeId: 'Node-missing' });
  actor.send(answerTo(sentCall(sendToSystem, 'FLOW_SELECT', 1), selected('Flow-first', 'Node-first')));
  expect(actor.getSnapshot().context.editingNodeId).toBeUndefined();
  expect(actor.getSnapshot().context.canvasError).toContain('Node-missing');
});

it('keeps a requested blueprint target when startup metadata arrives', () => {
  const actor = view();
  actor.send({ type: 'NODE.REVEAL', flowId: 'Flow-first', nodeId: 'Node-first' });
  const call = sentCall(sendToSystem, 'FLOW_SELECT');
  // Startup metadata lists every flow, the requested one among them
  actor.send({ type: 'FLOWS_CONNECTED', data: { selectedFlowId: 'Flow-root', graph: graph('Node-root'),
    flows: [{ id: 'Flow-first', entityType: 'Flow', label: 'Flow-first' }, { id: 'Flow-root', entityType: 'Flow', label: 'Flow-root' }],
    prompts: [], models: [], actions: [] } } as never);
  actor.send(answerTo(call, selected('Flow-first', 'Node-first')));
  expect(actor.getSnapshot().context).toMatchObject({ selectedFlowId: 'Flow-first', editingNodeId: 'Node-first' });
});

it('does not apply a late layout to a different graph', async () => {
  const actor = view();
  actor.send({ type: 'NODE.REVEAL', flowId: 'Flow-first', nodeId: 'Node-first' });
  actor.send(answerTo(sentCall(sendToSystem, 'FLOW_SELECT'), selected('Flow-first', 'Node-first')));
  actor.send({ type: 'NODE.REVEAL', flowId: 'Flow-second', nodeId: 'Node-second' });
  actor.send(answerTo(sentCall(sendToSystem, 'FLOW_SELECT', 1), selected('Flow-second', 'Node-second')));
  layouts[0]({ 'Node-first': { x: 10, y: 20 } }); await Promise.resolve();
  expect(actor.getSnapshot().context.graph.positions).toEqual({});
  layouts[1]({ 'Node-second': { x: 30, y: 40 } }); await Promise.resolve();
  expect(actor.getSnapshot().context.graph.positions).toEqual({ 'Node-second': { x: 30, y: 40 } });
});

it('applies a layout to the same flow even when its graph was rebuilt while the layout ran', async () => {
  const actor = view();
  actor.send({ type: 'NODE.REVEAL', flowId: 'Flow-first', nodeId: 'Node-first' });
  actor.send(answerTo(sentCall(sendToSystem, 'FLOW_SELECT'), selected('Flow-first', 'Node-first')));
  actor.send({ type: 'NODE.UPDATE', nodeId: 'Node-first', updates: { label: 'Renamed' } });
  layouts[0]({ 'Node-first': { x: 10, y: 20 } }); await Promise.resolve();
  expect(actor.getSnapshot().context.graph.positions).toEqual({ 'Node-first': { x: 10, y: 20 } });
  expect(actor.getSnapshot().context.graph.nodes[0].label).toBe('Renamed');
});

it('refreshes only the current graph and preserves its node editor', () => {
  const actor = view();
  actor.send({ type: 'NODE.REVEAL', flowId: 'Flow-first', nodeId: 'Node-first' });
  actor.send(answerTo(sentCall(sendToSystem, 'FLOW_SELECT'), selected('Flow-first', 'Node-first')));
  actor.send({ ...selected('Flow-second', 'Node-second'), type: 'FLOW_REFRESHED' });
  expect(actor.getSnapshot().context.selectedFlowId).toBe('Flow-first');
  actor.send({ ...selected('Flow-first', 'Node-first'), type: 'FLOW_REFRESHED' });
  expect(actor.getSnapshot().context.editingNodeId).toBe('Node-first');
});

const connected = (flowIds: `Flow-${string}`[], selectedFlowId: `Flow-${string}`, nodeId: `Node-${string}`) => ({
  type: 'FLOWS_CONNECTED' as const,
  data: { flows: flowIds.map(id => ({ id, entityType: 'Flow', label: id })), prompts: [], models: [], actions: [],
    selectedFlowId, graph: graph(nodeId), rootFlow: { id: selectedFlowId }, settings: {} },
}) as never;

it('asks for the shown flow again when the backend publishes, keeping the open node editor', () => {
  const actor = view();
  actor.send({ type: 'NODE.REVEAL', flowId: 'Flow-first', nodeId: 'Node-first' });
  actor.send(answerTo(sentCall(sendToSystem, 'FLOW_SELECT'), selected('Flow-first', 'Node-first')));
  expect(actor.getSnapshot().context.editingNodeId).toBe('Node-first');
  // Published after data was replaced: the flow still exists, but its graph may not be the one on screen
  actor.send(connected(['Flow-first', 'Flow-root'], 'Flow-root', 'Node-root'));
  const refresh = sentCall(sendToSystem, 'FLOW_SELECT', 1);
  expect(actor.getSnapshot().context.selectedFlowId).toBe('Flow-first');
  actor.send(answerTo(refresh, selected('Flow-first', 'Node-first')));
  expect(actor.getSnapshot().context.editingNodeId).toBe('Node-first');
  expect(actor.getSnapshot().context.pendingFlow).toBeUndefined();
});

it('shows the root flow the backend publishes when the shown flow is gone', () => {
  const actor = view();
  actor.send({ type: 'NODE.REVEAL', flowId: 'Flow-first', nodeId: 'Node-first' });
  actor.send(answerTo(sentCall(sendToSystem, 'FLOW_SELECT'), selected('Flow-first', 'Node-first')));
  actor.send(connected(['Flow-root'], 'Flow-root', 'Node-root'));
  expect(actor.getSnapshot().context.selectedFlowId).toBe('Flow-root');
  expect(actor.getSnapshot().context.graph.nodes.map(node => node.id)).toEqual(['Node-root']);
  expect(actor.getSnapshot().context.editingNodeId).toBeUndefined();
  expect(sendToSystem.mock.calls.filter(([, event]) => (event as { type: string }).type === 'FLOW_SELECT')).toHaveLength(1);
});

/** The shown flow, answered, then published again: the refresh it asked for is the second FLOW_SELECT */
function refreshing() {
  const actor = view();
  actor.send({ type: 'OPEN_ENTITY', id: 'Flow-first' });
  actor.send(answerTo(sentCall(sendToSystem, 'FLOW_SELECT'), selected('Flow-first', 'Node-first')));
  actor.send(connected(['Flow-first', 'Flow-root'], 'Flow-root', 'Node-root'));
  return { actor, refresh: sentCall(sendToSystem, 'FLOW_SELECT', 1) };
}
const nodesOf = (actor: ReturnType<typeof view>) => actor.getSnapshot().context.graph.nodes.map(node => node.id);
const withAdded = { type: 'FLOW_SELECTED' as const, flowId: 'Flow-first' as const,
  data: { nodes: [...graph('Node-first').nodes, ...graph('Node-added').nodes], edges: [] } };

it.each(['double-click a node', 'reselect the shown flow', 'leave the plugin'] as const)(
  'applies a refresh in flight after the user does %s', where => {
    const { actor, refresh } = refreshing();
    if (where === 'double-click a node') actor.send({ type: 'NODE.DOUBLE_CLICK', nodeId: 'Node-first' } as never);
    else if (where === 'reselect the shown flow') actor.send({ type: 'FLOW.SELECT', flowId: 'Flow-first' });
    else actor.send({ type: 'PLUGIN_DEACTIVATED' });
    actor.send(answerTo(refresh, withAdded));
    expect(nodesOf(actor)).toEqual(['Node-first', 'Node-added']);
  });

it('gives up opening a flow the published data no longer has, and shows the root flow', () => {
  const actor = view();
  actor.send({ type: 'OPEN_ENTITY', id: 'Flow-first' });
  actor.send(answerTo(sentCall(sendToSystem, 'FLOW_SELECT'), selected('Flow-first', 'Node-first')));
  actor.send({ type: 'FLOW.SELECT', flowId: 'Flow-second' });
  const opening = sentCall(sendToSystem, 'FLOW_SELECT', 1);
  // A reset removed both flows while the second was being opened
  actor.send(connected(['Flow-root'], 'Flow-root', 'Node-root'));
  expect(actor.getSnapshot().context.selectedFlowId).toBe('Flow-root');
  expect(nodesOf(actor)).toEqual(['Node-root']);
  // The backend answers for the deleted flow with an empty graph, which is not shown
  actor.send(answerTo(opening, { type: 'FLOW_SELECTED', flowId: 'Flow-second', data: { nodes: [], edges: [] } }));
  expect(actor.getSnapshot().context.selectedFlowId).toBe('Flow-root');
  expect(nodesOf(actor)).toEqual(['Node-root']);
});

it.each([false, true])('keeps a node being added across a refresh (already in the answer: %s)', inAnswer => {
  // Creating a node reads the step palette, which the window's frontend host holds
  const stopFe = startFeTestRuntime({ catalog: { status: () => 'ready', problem: () => undefined, references: () => [],
    frontend: () => [], artifacts: () => [], blocks: () => [], events: () => [], dsl: () => [], steps: () => [], subscribe: () => () => {} } });
  try {
    const { actor, refresh } = refreshing();
    actor.send({ type: 'NODE.CREATE', nodeType: 'transform' });
    const tempId = sendToSystem.mock.calls.map(([, event]) => event as { type: string; tempId?: string })
      .find(event => event.type === 'CREATE_NODE')!.tempId!;
    const node = { ...graph('Node-new').nodes[0], nodeType: 'transform' };
    actor.send(answerTo(refresh, { type: 'FLOW_SELECTED', flowId: 'Flow-first',
      data: { nodes: [...graph('Node-first').nodes, ...(inAnswer ? [node] : [])], edges: [] } } as never));
    expect(nodesOf(actor)).toContain(inAnswer ? 'Node-new' : tempId);
    actor.send({ type: 'NODE_CREATED', tempId, nodeId: 'Node-new', node } as never);
    expect(nodesOf(actor)).toEqual(['Node-first', 'Node-new']);
  } finally { stopFe(); }
});
