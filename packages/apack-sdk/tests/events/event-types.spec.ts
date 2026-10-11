// A runtime list of an event union's types, which the app checks sends against, can't drift from the union: the
// expectations marked @ts-expect-error are checked by `npm run typecheck`, not at run time.
import { expect, it } from 'vitest';
import { eventTypes } from '../../src/events/index.ts';

type MemoEvents = { type: 'MEMO_ADDED'; text: string } | { type: 'MEMOS_CLEARED' };

it('lists the union\'s event types as a value', () => {
  expect(eventTypes<MemoEvents>()('MEMO_ADDED', 'MEMOS_CLEARED')).toEqual(['MEMO_ADDED', 'MEMOS_CLEARED']);
});

it('fails to compile for a list missing a type or naming one the union lacks', () => {
  // @ts-expect-error MEMOS_CLEARED is missing
  eventTypes<MemoEvents>()('MEMO_ADDED');
  // @ts-expect-error MEMO_REMOVED is no event of the union
  eventTypes<MemoEvents>()('MEMO_ADDED', 'MEMOS_CLEARED', 'MEMO_REMOVED');
});
