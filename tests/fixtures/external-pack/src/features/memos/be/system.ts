import { emit } from '#generated/events';
import { setup } from 'xstate';
import { defineSystem, type SystemEntry } from '@abuddy/sdk/framework';
import { bus } from '@abuddy/sdk/ids';

import { repository } from '#generated/repository';
import { addMemoNote, type MemoNoteDTO } from './memo-notes';
import type { MemoDTO } from './types';

type IncomingMemosEvents =
  | { type: 'ADD_MEMO'; text: string }
  | { type: 'ADD_MEMO_NOTE'; text: string }
  | { type: 'ANNOUNCE_MEMO'; text: string };

export type OutgoingMemosEvents =
  | { type: 'MEMOS_CONNECTED'; memos: MemoDTO[] }
  | { type: 'MEMO_ADDED'; memo: MemoDTO }
  /** `note` is null when the note written through @abuddy/ears isn't found through the SDK */
  | { type: 'MEMO_NOTE_ADDED'; text: string; note: MemoNoteDTO | null };

export const memosSpec = defineSystem('memos')<IncomingMemosEvents, OutgoingMemosEvents>();
export const memos = memosSpec.id;

export const memosSystem = setup({
  types: memosSpec.types,
  actions: {
    sendConnectedData: ({ system }) => {
      system.get(bus).send(emit(memos, { type: 'MEMOS_CONNECTED', memos: repository.memoQueries.all() }));
    },
    addMemo: ({ system, event }) => {
      const { text } = memosSpec.typeOf('ADD_MEMO', event);
      system.get(bus).send(emit(memos, { type: 'MEMO_ADDED', memo: repository.memoCommands.add(text) }));
    },
    // A send to a dependency's plugin (abuddy.json sendsTo), named as code names another pack's feature
    announceMemo: ({ system, event }) => {
      const { text } = memosSpec.typeOf('ANNOUNCE_MEMO', event);
      system.get(bus).send(emit('default-setup/logs', {
        type: 'LOG_ADDED',
        log: { id: `memo-${Date.now()}`, timestamp: Date.now(), level: 'info', message: text, source: 'memos' },
      }));
    },
    addMemoNote: ({ system, event }) => {
      const { text } = memosSpec.typeOf('ADD_MEMO_NOTE', event);
      system.get(bus).send(emit(memos, { type: 'MEMO_NOTE_ADDED', text, note: addMemoNote(text) }));
    },
  },
}).createMachine({
  id: memos,
  initial: 'idle',
  on: {
    ADD_MEMO: { actions: 'addMemo' },
    ADD_MEMO_NOTE: { actions: 'addMemoNote' },
    ANNOUNCE_MEMO: { actions: 'announceMemo' },
  },
  states: {
    idle: {
      on: {
        CLIENT_CONNECTED: { actions: 'sendConnectedData' },
      },
    },
  },
});

const memosEntry = { spec: memosSpec, machine: memosSystem } satisfies SystemEntry;

export default memosEntry;
