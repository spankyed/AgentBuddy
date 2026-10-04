// The trace viewer's flow events: a reply that names its flow, against a view that has switched flows.
//
// Every `GET_FLOW_EVENTS` assigns `currentFlowId` before it sends — both the auto-select on the flow list
// and an explicit selection — so the reply's own `flowId` tells it from an answer for a flow the viewer
// has left. Without the check, clicking two flows quickly shows the first one's events under the second.
//
// **What `flowId` cannot settle, and the contract is why.** `GET_FLOW_EVENTS` carries `flowId`, `offset`
// and `limit`; the reply echoes `flowId` and `hasMore` only. `setFlowEvents` decides append-or-replace
// from `context.tracePagination.offset` rather than from an echoed offset, so two paginated requests for
// the *same* flow can still both append. Closing that needs the backend to echo `offset` — it is not a
// guard this side can write — so this file covers the cross-flow half and says so rather than implying
// the pair is finished.
import { beforeEach, expect, it, vi } from 'vitest';
import { createActor } from 'xstate';

const sendToSystem = vi.hoisted(() => vi.fn());
vi.mock('#generated/events.ts', () => ({ sendToSystem }));

const { default: databaseState } = await import('#features/database/fe/state.ts');

const anEvent = (id: string) => ({ id, label: id }) as never;

/** The trace viewer, which is where flow selection is handled */
function tracing() {
  const actor = createActor(databaseState).start();
  actor.send({ type: 'VIEW_MODE.TOGGLE' } as never);
  return actor;
}

const flowEvents = (actor: ReturnType<typeof tracing>) =>
  actor.getSnapshot().context.flowEvents.map((event: { id: string }) => event.id);

beforeEach(() => {
  sendToSystem.mockReset();
});

it('shows the flow last selected, not the answer that arrived last', () => {
  const actor = tracing();

  actor.send({ type: 'TRACE.SELECT_FLOW', flowId: 'f1' } as never);
  actor.send({ type: 'TRACE.SELECT_FLOW', flowId: 'f2' } as never);
  expect(actor.getSnapshot().context.currentFlowId, 'the selection assigns it at once').toBe('f2');

  // f1's answer turns up after the viewer has moved on
  actor.send({
    type: 'FLOW_EVENTS_RESULT',
    flowId: 'f1',
    events: [anEvent('from-f1')],
    hasMore: false,
  } as never);
  expect(flowEvents(actor), 'not shown under f2').toEqual([]);

  actor.send({
    type: 'FLOW_EVENTS_RESULT',
    flowId: 'f2',
    events: [anEvent('from-f2')],
    hasMore: false,
  } as never);
  expect(flowEvents(actor)).toEqual(['from-f2']);
});

it('clears the previous flow\'s events when a new one is selected', () => {
  const actor = tracing();

  actor.send({ type: 'TRACE.SELECT_FLOW', flowId: 'f1' } as never);
  actor.send({
    type: 'FLOW_EVENTS_RESULT', flowId: 'f1', events: [anEvent('from-f1')], hasMore: false,
  } as never);
  expect(flowEvents(actor)).toEqual(['from-f1']);

  actor.send({ type: 'TRACE.SELECT_FLOW', flowId: 'f2' } as never);
  expect(flowEvents(actor), 'the view does not show one flow under another while loading').toEqual([]);
});
