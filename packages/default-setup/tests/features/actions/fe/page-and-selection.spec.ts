// Two replies that already name what they answer, and what happens when a second request is in flight.
//
// `ACTIONS_PAGE_LOADED` carries the page it holds and `ACTION_SELECTED` the action it describes, so
// neither needs a new field to be identifiable — only a reader that looks. Without one, a double-click
// on "load more" appends the same page twice, and two quick selections are decided by arrival order.
import { beforeEach, expect, it, vi } from 'vitest';
import { createActor } from 'xstate';
import type { ActionEntity } from '@abuddy/sdk';

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
 * `ACTION_SELECTED` names its action, so the reply for the one no longer wanted is identifiable — but
 * `selectedActionId` is written *from the reply*, so there is nothing to compare it against until the
 * request records what it asked for.
 */
it('shows the action last asked for, not the answer that arrived last', () => {
  const actor = listed();

  actor.send({ type: 'ACTION.SELECT', actionId: 'Action-a1' });
  actor.send({ type: 'ACTION.SELECT', actionId: 'Action-a2' });
  expect(sentTypes().filter((type) => type === 'ACTION_SELECT')).toHaveLength(2);

  // a2 answers first, then a1's older answer turns up
  actor.send({ type: 'ACTION_SELECTED', actionId: 'Action-a2', data: anAction('Action-a2') });
  actor.send({ type: 'ACTION_SELECTED', actionId: 'Action-a1', data: anAction('Action-a1') });

  expect(actor.getSnapshot().context.selectedActionId).toBe('Action-a2');
});
