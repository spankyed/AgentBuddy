// Two replies that already name what they answer, and what happens when a second request is in flight.
//
// `ACTIONS_PAGE_LOADED` carries the page it holds and `ACTION_SELECTED` the action it describes, so
// neither needs a new field to be identifiable — only a reader that looks. Without one, a double-click
// on "load more" appends the same page twice, and two quick selections are decided by arrival order.
import { beforeEach, expect, it, vi } from 'vitest';
import { createActor } from 'xstate';

const sendToSystem = vi.hoisted(() => vi.fn());
vi.mock('#generated/events.ts', () => ({ sendToSystem }));

const { default: actionsState } = await import('#features/actions/fe/state.ts');

/** An action as the view reads it; only the fields these assertions touch are real */
const anAction = (id: string) => ({
  id, label: id, description: '', category: '', input: {}, actionFn: '', output: {},
}) as never;

/** A started plugin showing page 1, which is the state a double-click starts from */
function listed() {
  const actor = createActor(actionsState).start();
  actor.send({
    type: 'ACTIONS_LISTED',
    data: { actions: [anAction('a1')], totalCount: 3, page: 1, totalPages: 3, categories: [] },
  } as never);
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

  actor.send({ type: 'ACTIONS.LOAD_MORE' } as never);
  actor.send({ type: 'ACTIONS.LOAD_MORE' } as never);
  expect(sentTypes().filter((type) => type === 'FETCH_ACTIONS_PAGE'), 'both clicks asked').toHaveLength(2);

  const page2 = { actions: [anAction('a2')], page: 2, totalPages: 3 };
  actor.send({ type: 'ACTIONS_PAGE_LOADED', data: page2 } as never);
  actor.send({ type: 'ACTIONS_PAGE_LOADED', data: page2 } as never);

  const { actions, page } = actor.getSnapshot().context;
  expect(actions.map((action) => action.id)).toEqual(['a1', 'a2']);
  expect(page).toBe(2);
});

it('takes the page it is waiting for', () => {
  const actor = listed();
  actor.send({ type: 'ACTIONS.LOAD_MORE' } as never);

  // A reply for a page nobody asked for — a leftover from before a filter reset, say
  actor.send({
    type: 'ACTIONS_PAGE_LOADED',
    data: { actions: [anAction('stale')], page: 3, totalPages: 3 },
  } as never);
  expect(actor.getSnapshot().context.actions.map((a) => a.id), 'not appended').toEqual(['a1']);

  actor.send({
    type: 'ACTIONS_PAGE_LOADED',
    data: { actions: [anAction('a2')], page: 2, totalPages: 3 },
  } as never);
  expect(actor.getSnapshot().context.actions.map((a) => a.id)).toEqual(['a1', 'a2']);
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

  actor.send({ type: 'ACTION.SELECT', actionId: 'a1' } as never);
  actor.send({ type: 'ACTION.SELECT', actionId: 'a2' } as never);
  expect(sentTypes().filter((type) => type === 'ACTION_SELECT')).toHaveLength(2);

  // a2 answers first, then a1's older answer turns up
  actor.send({ type: 'ACTION_SELECTED', actionId: 'a2', data: anAction('a2') } as never);
  actor.send({ type: 'ACTION_SELECTED', actionId: 'a1', data: anAction('a1') } as never);

  expect(actor.getSnapshot().context.selectedActionId).toBe('a2');
});
