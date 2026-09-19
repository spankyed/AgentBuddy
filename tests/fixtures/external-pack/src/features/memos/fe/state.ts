import { setup, assign, type ActorRefFrom } from 'xstate';
import { safeEvents } from '@abuddy/sdk/fe';
import { sendToSystem } from '#generated/events';
import type { OutgoingMemosEvents } from '../be/system';
import type { MemoNoteDTO } from '../be/memo-notes';
import type { MemoDTO } from '../be/types';

export const id = 'memos' as const;

type UIEvents = { type: 'MEMOS.ADD'; text: string } | { type: 'MEMOS.ADD_NOTE'; text: string };
export type MemosEvents = UIEvents | OutgoingMemosEvents;

const typeOf = safeEvents<MemosEvents>();

const memosState = setup({
  types: {
    context: {} as { memos: MemoDTO[]; notes: Array<{ text: string; note: MemoNoteDTO | null }> },
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
      sendToSystem('memos', { type: 'ADD_MEMO', text: typeOf('MEMOS.ADD', event).text });
    },
    addNote: assign({
      notes: ({ context, event }) => {
        const { text, note } = typeOf('MEMO_NOTE_ADDED', event);
        return [...context.notes, { text, note }];
      },
    }),
    sendAddNote: ({ event }) => {
      sendToSystem('memos', { type: 'ADD_MEMO_NOTE', text: typeOf('MEMOS.ADD_NOTE', event).text });
    },
  },
}).createMachine({
  id,
  context: { memos: [], notes: [] },
  on: {
    MEMOS_CONNECTED: { actions: 'setMemos' },
    MEMO_ADDED: { actions: 'addMemo' },
    'MEMOS.ADD': { actions: 'sendAdd' },
    MEMO_NOTE_ADDED: { actions: 'addNote' },
    'MEMOS.ADD_NOTE': { actions: 'sendAddNote' },
  },
});

export type MemosState = ActorRefFrom<typeof memosState>;

export default memosState;
