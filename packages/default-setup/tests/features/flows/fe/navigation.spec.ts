import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createActor } from 'xstate';
import { answerTo } from '@apackdev/sdk/testing';
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
  actor.send({ type: 'FLOWS_CONNECTED', data: { selectedFlowId: 'Flow-root', graph: graph('Node-root'),
    flows: [], prompts: [], models: [], actions: [] } });
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

it('refreshes only the current graph and preserves its node editor', () => {
  const actor = view();
  actor.send({ type: 'NODE.REVEAL', flowId: 'Flow-first', nodeId: 'Node-first' });
  actor.send(answerTo(sentCall(sendToSystem, 'FLOW_SELECT'), selected('Flow-first', 'Node-first')));
  actor.send({ ...selected('Flow-second', 'Node-second'), type: 'FLOW_REFRESHED' });
  expect(actor.getSnapshot().context.selectedFlowId).toBe('Flow-first');
  actor.send({ ...selected('Flow-first', 'Node-first'), type: 'FLOW_REFRESHED' });
  expect(actor.getSnapshot().context.editingNodeId).toBe('Node-first');
});
