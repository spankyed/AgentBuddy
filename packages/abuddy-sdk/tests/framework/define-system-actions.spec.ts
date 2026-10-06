// What a handler is handed, which is the whole of this change: the answer for the message it is handling, or
// nothing when that message named no sender.
//
// It replaces an ambient `reply()` that read the delivery at the moment it was *called*. Two things were wrong
// with that and both are cases here: a handler's signature said nothing about whether an answer was owed — the
// defect that let `/set-setting` report success for every refused write — and an answer stored for later read
// whatever scope it was eventually called in, which is usually none.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { assign } from 'xstate';
import { defineSystem } from '../../src/framework/define-system.ts';
import { _runDelivery, type Reply } from '../../src/events/index.ts';
import { startTestRuntime, testRootEvents } from '../../src/testing/index.ts';

startTestRuntime();

type Contract = {
  context: { count: number };
  incoming: { type: 'ASK' } | { type: 'TELL'; note: string };
  outgoing: { type: 'ANSWERED' };
};

const spec = defineSystem<Contract>();

/** The arguments XState would hand an action, as far as these cases care */
const args = () => ({ context: { count: 0 }, event: { type: 'ASK' } } as never);

/** A message that named who sent it, and one that did not */
const asked = { receiver: 'pack/feature', replyTo: 'pack/asker', client: 'c-1' };
const unasked = { receiver: 'pack/feature' };

let sent: Array<{ to?: string; type: string; client?: string }>;
let stopListening: () => void;

beforeEach(() => {
  sent = [];
  stopListening = testRootEvents.onPluginSend((message) => {
    sent.push({ to: message.to, type: message.event.type, client: message.client });
  });
});

afterEach(() => stopListening());

describe('an action built from the spec', () => {
  it('is handed the answer for the message it is handling', () => {
    const table = spec.actions({
      answer: ({ reply }) => { reply?.({ type: 'ANSWERED' }); },
    });

    _runDelivery(asked, () => table.answer(args(), undefined));

    expect(sent).toEqual([{ to: 'pack/asker', type: 'ANSWERED', client: 'c-1' }]);
  });

  /**
   * The case the nullability is for. `answerSettings` used to ask this of a global —
   * `_currentDelivery()?.replyTo === undefined` — and nothing made an author ask it at all.
   */
  it('is handed nothing when the message named no sender, so the fallback is the compiler\'s question', () => {
    let had: Reply | undefined = (() => {}) as Reply;
    const table = spec.actions({
      answer: ({ reply }) => { had = reply; },
    });

    _runDelivery(unasked, () => table.answer(args(), undefined));

    expect(had).toBeUndefined();
    expect(sent, 'and nothing was broadcast in its place — that is the handler\'s call, not ours').toEqual([]);
  });

  it('keeps a second argument, so an action named with params still reads them', () => {
    const seen: string[] = [];
    const table = spec.actions({
      refuse: (_args, { reason }: { reason: string }) => { seen.push(reason); },
    });

    _runDelivery(asked, () => table.refuse(args(), { reason: 'a backup is importing' }));

    expect(seen).toEqual(['a backup is importing']);
  });

  /**
   * An action creator's result is not a handler and must come through untouched: XState resolves it by an own
   * `resolve` property, which wrapping would hide. Identity rather than behaviour, because that is the claim.
   */
  it('passes an action creator\'s result through as it is', () => {
    const made = assign<{ count: number }, { type: 'ASK' }, undefined, { type: 'ASK' }, never>({ count: 1 });
    const table = spec.actions({ bump: made as never });

    expect(table.bump, 'the same object, not a wrapper around it').toBe(made);
  });

  /**
   * The gap this closes, and the reason `reply` is bound at entry rather than read at use.
   *
   * A callback registered inside one delivery and fired outside any — an event listener, a subscription, a
   * `.on('data')` — read no sender at all under the ambient `reply`, which then threw. Measured before this
   * existed: it answered `NONE`.
   */
  it('hands an answer that still works after its delivery has ended', () => {
    let later: (() => void) | undefined;
    const table = spec.actions({
      remember: ({ reply }) => { later = () => reply?.({ type: 'ANSWERED' }); },
    });

    _runDelivery(asked, () => table.remember(args(), undefined));
    expect(sent, 'nothing yet — the handler only stored it').toEqual([]);

    later!();

    expect(sent, 'answered the asker it was bound to, from outside any delivery').toEqual([
      { to: 'pack/asker', type: 'ANSWERED', client: 'c-1' },
    ]);
  });
});

describe('an invoke input built from the spec', () => {
  it('hands the actor an answer bound to the delivery that started it', () => {
    const build = spec.input(({ reply }) => ({ reply }));

    const { reply } = _runDelivery(asked, () => build(args()));
    reply?.({ type: 'ANSWERED' });

    expect(sent).toEqual([{ to: 'pack/asker', type: 'ANSWERED', client: 'c-1' }]);
  });

  it('hands nothing on when the message named no sender', () => {
    const build = spec.input(({ reply }) => ({ reply }));

    expect(_runDelivery(unasked, () => build(args())).reply).toBeUndefined();
  });
});
