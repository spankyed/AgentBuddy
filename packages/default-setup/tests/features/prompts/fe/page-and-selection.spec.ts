// The prompts plugin's half of the same question the actions plugin answers: a reply that already names
// what it answers, and a second request in flight.
//
// `PROMPTS_PAGE_LOADED` carries its page and `PROMPT_SELECTED` its prompt, so neither needs a new field
// to be identifiable — only a reader that looks. Without one a double-click on "load more" appends the
// same page twice, and two quick selections are decided by arrival order.
import { beforeEach, expect, it, vi } from 'vitest';
import { createActor } from 'xstate';
import { answerTo } from '@abuddy/sdk/testing';
import { sentCall } from '../../../_support/calls.ts';
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

/** The call the nth `PROMPT_SELECT` was asked under, which the machine minted and the send carries */
const selectCall = (nth: number) => sentCall(sendToSystem, 'PROMPT_SELECT', nth);

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
 * **It correlates on the call, not on the prompt id** — though this case alone would not force that, since
 * comparing `promptId` against what the ask recorded passes it too. What the id cannot reach are the two
 * cases below it: it does not distinguish windows, and a slot holding one is never emptied. `answerTo`
 * builds the answer as a delivery door would.
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
 * A broadcast `PROMPT_SELECTED` reaches every window showing the prompts plugin, and a guard on the prompt id
 * alone admits it in all of them — two people looking at the same prompt take each other's answers. Replying
 * narrows it to the asker, and the call narrows it to the ask: one from elsewhere matches nothing here.
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
 * A slot that is only ever set names the last ask for the life of the plugin. Cleared on the answer, the
 * same answer arriving twice — a reconnect replaying it, a double delivery — matches nothing the second
 * time, and an ask made since is still outstanding.
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
 * **The case a hand-written comparison gets wrong**: `_callOf(event) === context.pendingPromptCall` reads
 * `undefined === undefined` for an empty slot, which is the resting state — so it admits an answer nobody
 * asked for, on the common path rather than an edge.
 *
 * Held by two things independently — `answersCall` refuses an empty slot, and the slot is `null` — so this
 * fires only on losing both. `abuddy-sdk/tests/events/calls.spec.ts` holds the check itself.
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
