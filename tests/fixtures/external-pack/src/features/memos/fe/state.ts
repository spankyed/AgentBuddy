import { setup, assign, type ActorRefFrom } from 'xstate';
import { safeEvents } from '@abuddy/sdk/fe';
import { trpc } from '@abuddy/sdk/rpc';
import { busId } from '#generated/bus-ids';
import type { OutgoingMemosEvents } from '../be/system';
import type { MemoDTO } from '../be/types';

export const id = 'memos' as const;

type UIEvents = { type: 'MEMOS.ADD'; text: string };
export type MemosEvents = UIEvents | OutgoingMemosEvents;

const typeOf = safeEvents<MemosEvents>();

const memosState = setup({
  types: {
    context: {} as { memos: MemoDTO[] },
    events: {} as MemosEvents,
  },
  actions: {
    setMemos: assign({
      memos: ({ event }) => typeOf('MEMOS_CONNECTED', event).memos,
    }),
    addMemo: assign({
      memos: ({ context, event }) => {
        const memo = typeOf('MEMO_ADDED', event).memo;
        return context.memos.some(m => m.id === memo.id) ? context.memos : [...context.memos, memo];
      },
    }),
    sendAdd: ({ event }) => {
      trpc.bus.send.mutate({ systemId: busId.memos, type: 'ADD_MEMO', text: typeOf('MEMOS.ADD', event).text });
    },
  },
}).createMachine({
  id,
  context: { memos: [] },
  on: {
    MEMOS_CONNECTED: { actions: 'setMemos' },
    MEMO_ADDED: { actions: 'addMemo' },
    'MEMOS.ADD': { actions: 'sendAdd' },
  },
});

export type MemosState = ActorRefFrom<typeof memosState>;

export default memosState;
