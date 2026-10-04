// The prompts plugin's half of the same question the actions plugin answers: a reply that already names
// what it answers, and a second request in flight.
//
// `PROMPTS_PAGE_LOADED` carries its page and `PROMPT_SELECTED` its prompt, so neither needs a new field
// to be identifiable — only a reader that looks. Without one a double-click on "load more" appends the
// same page twice, and two quick selections are decided by arrival order.
import { beforeEach, expect, it, vi } from 'vitest';
import { createActor } from 'xstate';

const sendToSystem = vi.hoisted(() => vi.fn());
vi.mock('#generated/events.ts', () => ({ sendToSystem }));

const { default: promptsState } = await import('#features/prompts/fe/state.ts');

/** A prompt as the view reads it; only the fields these assertions touch are real */
const aPrompt = (id: string) => ({ id, label: id, description: '', category: '', template: '' }) as never;

/** A started plugin showing page 1, which is the state a double-click starts from */
function connected() {
  const actor = createActor(promptsState).start();
  actor.send({
    type: 'PROMPTS_CONNECTED',
    data: { prompts: [aPrompt('p1')], totalCount: 3, page: 1, totalPages: 3, categories: [] },
  } as never);
  return actor;
}

const sentTypes = () => sendToSystem.mock.calls.map(([, event]) => (event as { type: string }).type);

beforeEach(() => {
  sendToSystem.mockReset();
});

it('appends a page once, however many times it was asked for', () => {
  const actor = connected();

  actor.send({ type: 'PROMPTS.LOAD_MORE' } as never);
  actor.send({ type: 'PROMPTS.LOAD_MORE' } as never);
  expect(sentTypes().filter((type) => type === 'FETCH_PROMPTS_PAGE'), 'both clicks asked').toHaveLength(2);

  const page2 = { prompts: [aPrompt('p2')], page: 2, totalPages: 3 };
  actor.send({ type: 'PROMPTS_PAGE_LOADED', data: page2 } as never);
  actor.send({ type: 'PROMPTS_PAGE_LOADED', data: page2 } as never);

  const { prompts, page } = actor.getSnapshot().context;
  expect(prompts.map((prompt) => prompt.id)).toEqual(['p1', 'p2']);
  expect(page).toBe(2);
});

it('takes the page it is waiting for', () => {
  const actor = connected();
  actor.send({ type: 'PROMPTS.LOAD_MORE' } as never);

  // A reply for a page nobody asked for — a leftover from before a filter reset, say
  actor.send({
    type: 'PROMPTS_PAGE_LOADED',
    data: { prompts: [aPrompt('stale')], page: 3, totalPages: 3 },
  } as never);
  expect(actor.getSnapshot().context.prompts.map((p) => p.id), 'not appended').toEqual(['p1']);

  actor.send({
    type: 'PROMPTS_PAGE_LOADED',
    data: { prompts: [aPrompt('p2')], page: 2, totalPages: 3 },
  } as never);
  expect(actor.getSnapshot().context.prompts.map((p) => p.id)).toEqual(['p1', 'p2']);
});

/**
 * Two selections in flight, the older answer arriving second.
 *
 * `selectedPromptId` is written *from* the reply, so until the request records what it asked for there
 * is nothing to compare an arriving one against.
 */
it('shows the prompt last asked for, not the answer that arrived last', () => {
  const actor = connected();

  actor.send({ type: 'PROMPT.SELECT', promptId: 'p1' } as never);
  actor.send({ type: 'PROMPT.SELECT', promptId: 'p2' } as never);
  expect(sentTypes().filter((type) => type === 'PROMPT_SELECT')).toHaveLength(2);

  // p2 answers first, then p1's older answer turns up
  actor.send({ type: 'PROMPT_SELECTED', promptId: 'p2', data: aPrompt('p2') } as never);
  actor.send({ type: 'PROMPT_SELECTED', promptId: 'p1', data: aPrompt('p1') } as never);

  expect(actor.getSnapshot().context.selectedPromptId).toBe('p2');
});
