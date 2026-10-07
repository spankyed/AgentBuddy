// The prompts plugin's half of the same question the actions plugin answers: a reply that already names
// what it answers, and a second request in flight.
//
// `PROMPTS_PAGE_LOADED` carries its page and `PROMPT_SELECTED` its prompt, so neither needs a new field
// to be identifiable — only a reader that looks. Without one a double-click on "load more" appends the
// same page twice, and two quick selections are decided by arrival order.
import { beforeEach, expect, it, vi } from 'vitest';
import { createActor } from 'xstate';
import { answerTo } from '@abuddy/sdk/testing';
import type { PromptEntity } from '@abuddy/sdk';

const sendToSystem = vi.hoisted(() => vi.fn());
vi.mock('#generated/events.ts', () => ({ sendToSystem }));

const { default: promptsState } = await import('#features/prompts/fe/state.ts');

/** A prompt as the view reads it; only the fields these assertions touch are real */
const aPrompt = (id: string) => ({ id, label: id, description: '', category: '', template: '' }) as unknown as PromptEntity;

/** A started plugin showing page 1, which is the state a double-click starts from */
function connected() {
  const actor = createActor(promptsState).start();
  actor.send({
    type: 'PROMPTS_CONNECTED',
    data: { prompts: [aPrompt('Prompt-p1')], totalCount: 3, page: 1, totalPages: 3, categories: [] },
  });
  return actor;
}

const sentTypes = () => sendToSystem.mock.calls.map(([, event]) => (event as { type: string }).type);

/**
 * The call the nth `PROMPT_SELECT` was asked under, read off the mocked send's third argument.
 *
 * The machine mints it and hands it to `sendToSystem`, so this is how a spec learns what the real backend's
 * `reply` would echo — there is no field on the event to read it from, which is the design.
 */
const selectCall = (nth: number): string => {
  const selects = sendToSystem.mock.calls.filter(([, event]) => (event as { type: string }).type === 'PROMPT_SELECT');
  const options = selects[nth]?.[2] as { call?: string } | undefined;
  // Named rather than asserted through: a missing call means the machine did not ask, which is a different
  // failure from taking the wrong answer and should not read as `undefined` reaching an assertion
  if (options?.call === undefined) throw new Error(`no PROMPT_SELECT #${nth} carrying a call; sent ${selects.length}`);
  return options.call;
};

beforeEach(() => {
  sendToSystem.mockReset();
});

it('appends a page once, however many times it was asked for', () => {
  const actor = connected();

  actor.send({ type: 'PROMPTS.LOAD_MORE' });
  actor.send({ type: 'PROMPTS.LOAD_MORE' });
  expect(sentTypes().filter((type) => type === 'FETCH_PROMPTS_PAGE'), 'both clicks asked').toHaveLength(2);

  const page2 = { prompts: [aPrompt('Prompt-p2')], page: 2, totalPages: 3 };
  actor.send({ type: 'PROMPTS_PAGE_LOADED', data: page2 });
  actor.send({ type: 'PROMPTS_PAGE_LOADED', data: page2 });

  const { prompts, page } = actor.getSnapshot().context;
  expect(prompts.map((prompt) => prompt.id)).toEqual(['Prompt-p1', 'Prompt-p2']);
  expect(page).toBe(2);
});

it('takes the page it is waiting for', () => {
  const actor = connected();
  actor.send({ type: 'PROMPTS.LOAD_MORE' });

  // A reply for a page nobody asked for — a leftover from before a filter reset, say
  actor.send({
    type: 'PROMPTS_PAGE_LOADED',
    data: { prompts: [aPrompt('Prompt-stale')], page: 3, totalPages: 3 },
  });
  expect(actor.getSnapshot().context.prompts.map((p) => p.id), 'not appended').toEqual(['Prompt-p1']);

  actor.send({
    type: 'PROMPTS_PAGE_LOADED',
    data: { prompts: [aPrompt('Prompt-p2')], page: 2, totalPages: 3 },
  });
  expect(actor.getSnapshot().context.prompts.map((p) => p.id)).toEqual(['Prompt-p1', 'Prompt-p2']);
});

/**
 * Two selections in flight, the older answer arriving second.
 *
 * **It correlates on the call, not on the prompt id.** It used to compare `promptId` against a
 * `pendingPromptId` the ask recorded, which worked for *this* case and left two it could not reach: the answer
 * was broadcast to every window, so another window's answer for the same prompt matched too, and
 * `pendingPromptId` was never cleared, so after the first selection it always named something. A call is per
 * ask and per window, so neither has anywhere to live. `answerTo` builds the answer as a delivery door would.
 */
it('shows the prompt last asked for, not the answer that arrived last', () => {
  const actor = connected();

  actor.send({ type: 'PROMPT.SELECT', promptId: 'Prompt-p1' });
  actor.send({ type: 'PROMPT.SELECT', promptId: 'Prompt-p2' });
  expect(sentTypes().filter((type) => type === 'PROMPT_SELECT')).toHaveLength(2);

  // p2 answers first, then p1's older answer turns up
  actor.send(answerTo(selectCall(1), { type: 'PROMPT_SELECTED', promptId: 'Prompt-p2', data: aPrompt('Prompt-p2') }));
  actor.send(answerTo(selectCall(0), { type: 'PROMPT_SELECTED', promptId: 'Prompt-p1', data: aPrompt('Prompt-p1') }));

  expect(actor.getSnapshot().context.selectedPromptId).toBe('Prompt-p2');
});

/**
 * The answer another window got, which the prompt id could not tell from this window's.
 *
 * `PROMPT_SELECTED` was broadcast, so every window showing the prompts plugin received it and each one's guard
 * admitted it on the prompt id alone — two people looking at the same prompt each took the other's answer. It
 * is replied now, and a call from an ask this window did not make matches nothing.
 */
it('ignores an answer for an ask it did not make', () => {
  const actor = connected();
  actor.send({ type: 'PROMPT.SELECT', promptId: 'Prompt-p1' });

  actor.send(answerTo('c-another-window', { type: 'PROMPT_SELECTED', promptId: 'Prompt-p1', data: aPrompt('Prompt-p1') }));

  expect(actor.getSnapshot().context.selectedPromptId, 'still nothing selected').toBeUndefined();
});

/**
 * Settled, so the answer just taken cannot be taken again.
 *
 * The pending field had one setter and no clear, so it named the last ask for the life of the plugin. Cleared
 * on the answer, the same answer arriving twice — a reconnect replaying it, a double delivery — matches
 * nothing the second time, and an ask made since is still outstanding.
 */
it('clears what it is waiting for once the answer lands', () => {
  const actor = connected();
  actor.send({ type: 'PROMPT.SELECT', promptId: 'Prompt-p1' });
  const first = selectCall(0);

  actor.send(answerTo(first, { type: 'PROMPT_SELECTED', promptId: 'Prompt-p1', data: aPrompt('Prompt-p1') }));
  expect(actor.getSnapshot().context.pendingPromptCall, 'nothing outstanding').toBeNull();

  actor.send({ type: 'PROMPT.SELECT', promptId: 'Prompt-p2' });
  // The first answer again, which a cleared slot has nothing to match
  actor.send(answerTo(first, { type: 'PROMPT_SELECTED', promptId: 'Prompt-p1', data: aPrompt('Prompt-p1') }));

  expect(actor.getSnapshot().context.selectedPromptId, 'the older answer did not win').toBe('Prompt-p1');
  expect(actor.getSnapshot().context.pendingPromptCall, 'the second ask is still outstanding').toBe(selectCall(1));
});

/**
 * An answer carrying no call at all, with nothing outstanding — refused.
 *
 * **The case a hand-written comparison gets wrong.** `_callOf(event) === context.pendingPromptCall` reads
 * `undefined === undefined` for an empty slot, so it admits an answer nobody asked for — and an empty slot
 * is the resting state, which makes that the common path rather than an edge.
 *
 * **Protected twice over, and the case fires only on the combination.** `answersCall` refuses an empty
 * slot, and the slot is spelled `null`, so even a raw `===` would refuse here — measured: dropping
 * `answersCall`'s nullish check leaves this passing, and so does spelling the slot `undefined`; both
 * together is what fails it, which is the state it was written against. The nullish check itself is held
 * in `abuddy-sdk/tests/events/calls.spec.ts`; what this holds is the behaviour, whichever of the two
 * delivers it.
 */
it('refuses an answer carrying no call when nothing is outstanding', () => {
  const actor = connected();

  actor.send({ type: 'PROMPT_SELECTED', promptId: 'Prompt-p1', data: aPrompt('Prompt-p1') });

  expect(actor.getSnapshot().context.selectedPromptId, 'nobody asked, so nothing is selected').toBeUndefined();
});

/** And after an ask has settled, which leaves the slot empty again */
it('refuses an uncorrelated answer once an ask has settled', () => {
  const actor = connected();
  actor.send({ type: 'PROMPT.SELECT', promptId: 'Prompt-p1' });
  actor.send(answerTo(selectCall(0), { type: 'PROMPT_SELECTED', promptId: 'Prompt-p1', data: aPrompt('Prompt-p1') }));

  actor.send({ type: 'PROMPT_SELECTED', promptId: 'Prompt-stray', data: aPrompt('Prompt-stray') });

  expect(actor.getSnapshot().context.selectedPromptId, 'the settled answer still stands').toBe('Prompt-p1');
});
