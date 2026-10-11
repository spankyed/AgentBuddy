// Two answers and what happens when a second ask is in flight.
//
// `ACTIONS_PAGE_LOADED` carries the page it holds and `ACTION_SELECTED` the action it describes, so
// neither needs a new field to be identifiable — only a reader that looks. Without one, a double-click
// on "load more" appends the same page twice, and two quick selections are decided by arrival order.
import { beforeEach, expect, it, vi } from 'vitest';
import { createActor } from 'xstate';
import { answerTo } from '@apack/sdk/testing';
import { sentCall } from '../../../_support/calls.ts';
import type { ActionEntity } from '@apack/sdk';

const sendToSystem = vi.hoisted(() => vi.fn());
vi.mock('#generated/events.ts', () => ({ sendToSystem }));

const { default: actionsState } = await import('#features/actions/fe/state.ts');

/** An action as the view reads it; only the fields these assertions touch are real */
const anAction = (id: string) => ({
  id, label: id, description: '', category: '', input: {}, actionFn: '', output: {},
}) as unknown as ActionEntity;

/** A started plugin showing page 1, which is the state a double-click starts from */
function listed() {
  const actor = createActor(actionsState).start();
  actor.send({
    type: 'ACTIONS_LISTED',
    data: { actions: [anAction('Action-a1')], totalCount: 3, page: 1, totalPages: 3, categories: [] },
  });
  return actor;
}

const sentTypes = () => sendToSystem.mock.calls.map(([, event]) => (event as { type: string }).type);

/** The call the nth `ACTION_SELECT` was asked under, which the machine minted and the send carries */
const selectCall = (nth: number) => sentCall(sendToSystem, 'ACTION_SELECT', nth);

beforeEach(() => {
  sendToSystem.mockReset();
});

/**
 * The double-click, which is how this shows up for a person.
 *
 * `requestNextPage` sends `context.page + 1`, and `page` only moves when a reply lands — so two clicks
 * both ask for page 2, and a handler that appends whatever arrives appends page 2 twice.
 */
it('appends a page once, however many times it was asked for', () => {
  const actor = listed();

  actor.send({ type: 'ACTIONS.LOAD_MORE' });
  actor.send({ type: 'ACTIONS.LOAD_MORE' });
  expect(sentTypes().filter((type) => type === 'FETCH_ACTIONS_PAGE'), 'both clicks asked').toHaveLength(2);

  const page2 = { actions: [anAction('Action-a2')], page: 2, totalPages: 3 };
  actor.send({ type: 'ACTIONS_PAGE_LOADED', data: page2 });
  actor.send({ type: 'ACTIONS_PAGE_LOADED', data: page2 });

  const { actions, page } = actor.getSnapshot().context;
  expect(actions.map((action) => action.id)).toEqual(['Action-a1', 'Action-a2']);
  expect(page).toBe(2);
});

it('takes the page it is waiting for', () => {
  const actor = listed();
  actor.send({ type: 'ACTIONS.LOAD_MORE' });

  // A reply for a page nobody asked for — a leftover from before a filter reset, say
  actor.send({
    type: 'ACTIONS_PAGE_LOADED',
    data: { actions: [anAction('Action-stale')], page: 3, totalPages: 3 },
  });
  expect(actor.getSnapshot().context.actions.map((a) => a.id), 'not appended').toEqual(['Action-a1']);

  actor.send({
    type: 'ACTIONS_PAGE_LOADED',
    data: { actions: [anAction('Action-a2')], page: 2, totalPages: 3 },
  });
  expect(actor.getSnapshot().context.actions.map((a) => a.id)).toEqual(['Action-a1', 'Action-a2']);
});

/**
 * Two selections in flight, the older answer arriving second.
 *
 * **It correlates on the call, not on the action id** — though this case alone would not force that, since
 * comparing `actionId` against what the ask recorded passes it too. What the id cannot reach are the two
 * cases below it: it does not distinguish windows, and a slot holding one is never emptied. `answerTo`
 * builds the answer as a delivery door would.
 */
it('shows the action last asked for, not the answer that arrived last', () => {
  const actor = listed();

  actor.send({ type: 'ACTION.SELECT', actionId: 'Action-a1' });
  actor.send({ type: 'ACTION.SELECT', actionId: 'Action-a2' });
  expect(sentTypes().filter((type) => type === 'ACTION_SELECT')).toHaveLength(2);

  // a2 answers first, then a1's older answer turns up
  actor.send(answerTo(selectCall(1), { type: 'ACTION_SELECTED', actionId: 'Action-a2', data: anAction('Action-a2') }));
  actor.send(answerTo(selectCall(0), { type: 'ACTION_SELECTED', actionId: 'Action-a1', data: anAction('Action-a1') }));

  expect(actor.getSnapshot().context.selectedActionId).toBe('Action-a2');
});

/**
 * The answer another window got, which the action id could not tell from this window's.
 *
 * A broadcast `ACTION_SELECTED` reaches every window showing the actions plugin, and a guard on the action id
 * alone admits it in all of them — two people looking at the same action take each other's answers. Replying
 * narrows it to the asker, and the call narrows it to the ask: one from elsewhere matches nothing here.
 */
it('ignores an answer for an ask it did not make', () => {
  const actor = listed();
  actor.send({ type: 'ACTION.SELECT', actionId: 'Action-a1' });

  actor.send(answerTo('c-another-window', { type: 'ACTION_SELECTED', actionId: 'Action-a1', data: anAction('Action-a1') }));

  expect(actor.getSnapshot().context.selectedActionId, 'still nothing selected').toBeUndefined();
});

/**
 * Settled, so the answer just taken cannot be taken again.
 *
 * A slot that is only ever set names the last ask for the life of the plugin. Cleared on the answer, the
 * same answer arriving twice — a reconnect replaying it, a double delivery — matches nothing the second
 * time, and an ask made since is still outstanding.
 */
it('clears what it is waiting for once the answer lands', () => {
  const actor = listed();
  actor.send({ type: 'ACTION.SELECT', actionId: 'Action-a1' });
  const first = selectCall(0);

  actor.send(answerTo(first, { type: 'ACTION_SELECTED', actionId: 'Action-a1', data: anAction('Action-a1') }));
  expect(actor.getSnapshot().context.pendingActionCall, 'nothing outstanding').toBeNull();

  actor.send({ type: 'ACTION.SELECT', actionId: 'Action-a2' });
  // The first answer again, which a cleared slot has nothing to match
  actor.send(answerTo(first, { type: 'ACTION_SELECTED', actionId: 'Action-a1', data: anAction('Action-a1') }));

  expect(actor.getSnapshot().context.selectedActionId, 'the older answer did not win').toBe('Action-a1');
  expect(actor.getSnapshot().context.pendingActionCall, "the second ask is still outstanding").toBe(selectCall(1));
});

/**
 * An answer carrying no call at all, with nothing outstanding — refused.
 *
 * **The case a hand-written comparison gets wrong**: `_callOf(event) === context.pendingActionCall` reads
 * `undefined === undefined` for an empty slot, which is the resting state — so it admits an answer nobody
 * asked for, on the common path rather than an edge.
 *
 * Held by two things independently — `answersCall` refuses an empty slot, and the slot is `null` — so this
 * fires only on losing both. `apack-sdk/tests/events/calls.spec.ts` holds the check itself.
 */
it('refuses an answer carrying no call when nothing is outstanding', () => {
  const actor = listed();

  actor.send({ type: 'ACTION_SELECTED', actionId: 'Action-a1', data: anAction('Action-a1') });

  expect(actor.getSnapshot().context.selectedActionId, 'nobody asked, so nothing is selected').toBeUndefined();
});

/** And after an ask has settled, which leaves the slot empty again */
it('refuses an uncorrelated answer once an ask has settled', () => {
  const actor = listed();
  actor.send({ type: 'ACTION.SELECT', actionId: 'Action-a1' });
  actor.send(answerTo(selectCall(0), { type: 'ACTION_SELECTED', actionId: 'Action-a1', data: anAction('Action-a1') }));

  actor.send({ type: 'ACTION_SELECTED', actionId: 'Action-stray', data: anAction('Action-stray') });

  expect(actor.getSnapshot().context.selectedActionId, 'the settled answer still stands').toBe('Action-a1');
});
