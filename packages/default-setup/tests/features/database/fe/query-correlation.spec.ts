// The console's two verbs: an answer is taken only by the ask that is waiting for it.
//
// `EXECUTE_QUERY` and `EXECUTE_TRANSACTION` are independent and each holds one outstanding call, so an
// answer is placed by the call it names (`Message.answering`, which a delivery door puts on the event) and
// not by anything in its payload. Two slots rather than one, because deleting a row chains a transaction
// into a follow-up query and a single slot would have the query overwrite the transaction it came from.
//
// The case worth reading is the last pair: an answer carrying **no** call, arriving when nothing is
// outstanding. Whether a hand-written comparison refuses it depends on how the empty slot is spelled —
// `undefined === null` is false and `undefined === undefined` is true — which is a correctness question
// settled by a sentinel, and the reason `answersCall` owns it instead and `_callOf` is not a pack's to
// call.
import { beforeEach, expect, it, vi } from 'vitest';
import { createActor } from 'xstate';
import { answerTo } from '@abuddy/sdk/testing';

const sendToSystem = vi.hoisted(() => vi.fn());
vi.mock('#generated/events.ts', () => ({ sendToSystem }));

const { default: databaseState } = await import('#features/database/fe/state.ts');

/** The call the nth send of `type` was asked under, which the machine minted and handed to `sendToSystem` */
const callFor = (type: string, nth = 0): string => {
  const sends = sendToSystem.mock.calls.filter(([, event]) => (event as { type: string }).type === type);
  const options = sends[nth]?.[2] as { call?: string } | undefined;
  if (options?.call === undefined) throw new Error(`no ${type} #${nth} carrying a call; sent ${sends.length}`);
  return options.call;
};

const console_ = () => createActor(databaseState).start();

beforeEach(() => {
  sendToSystem.mockReset();
});

it('takes the result for the query it is waiting on', () => {
  const actor = console_();
  actor.send({ type: 'QUERY.EXECUTE', code: 'return 1' });

  actor.send(answerTo(callFor('EXECUTE_QUERY'), { type: 'QUERY_RESULT', result: 'mine', executionTime: 1 }));

  expect(actor.getSnapshot().context.queryResult).toBe('mine');
});

it('ignores a result for a query it has stopped waiting on', () => {
  const actor = console_();
  actor.send({ type: 'QUERY.EXECUTE', code: 'return 1' });
  const abandoned = callFor('EXECUTE_QUERY');
  // Asked again, so the first is no longer the outstanding one
  actor.send({ type: 'QUERY.EXECUTE', code: 'return 2' });

  actor.send(answerTo(abandoned, { type: 'QUERY_RESULT', result: 'stale', executionTime: 1 }));
  expect(actor.getSnapshot().context.queryResult, 'not taken').toBeNull();

  actor.send(answerTo(callFor('EXECUTE_QUERY', 1), { type: 'QUERY_RESULT', result: 'current', executionTime: 1 }));
  expect(actor.getSnapshot().context.queryResult).toBe('current');
});

/**
 * The two verbs keep separate slots, which matters because they share the result field.
 *
 * A `TRANSACTION_RESULT` writes `queryResult`, so the only thing keeping a transaction's answer out of a
 * query's result is that it is matched against `pendingTransactionCall` — empty here, since no transaction
 * was asked. One slot for both would take this.
 */
it('does not let one verb take the other verb\'s answer', () => {
  const actor = console_();
  actor.send({ type: 'QUERY.EXECUTE', code: 'return 1' });

  // A transaction answer naming the *query's* call: the right call, the wrong slot
  actor.send(answerTo(callFor('EXECUTE_QUERY'), { type: 'TRANSACTION_RESULT', result: 'wrong slot', executionTime: 1 }));

  expect(actor.getSnapshot().context.queryResult, 'no transaction was outstanding').toBeNull();
});

/**
 * An answer carrying no call at all, with nothing outstanding — refused.
 *
 * **Protected twice over, and the case fires only on the combination.** `answersCall` refuses an empty
 * slot, and the slot is spelled `null`, so even a raw `===` would refuse here — measured: dropping
 * `answersCall`'s nullish check leaves this passing, and so does spelling the slot `undefined`; both
 * together is what fails it, which is the state it was written against. The nullish check itself is held
 * in `abuddy-sdk/tests/events/calls.spec.ts`; what this holds is the behaviour, whichever of the two
 * delivers it.
 */
it('refuses a result carrying no call when no query is outstanding', () => {
  const actor = console_();

  actor.send({ type: 'QUERY_RESULT', result: 'nobody asked', executionTime: 1 });

  expect(actor.getSnapshot().context.queryResult).toBeNull();
});

it('refuses one once the query it was waiting on has settled', () => {
  const actor = console_();
  actor.send({ type: 'QUERY.EXECUTE', code: 'return 1' });
  actor.send(answerTo(callFor('EXECUTE_QUERY'), { type: 'QUERY_RESULT', result: 'mine', executionTime: 1 }));

  actor.send({ type: 'QUERY_RESULT', result: 'stray', executionTime: 1 });

  expect(actor.getSnapshot().context.queryResult, 'the settled answer still stands').toBe('mine');
});
