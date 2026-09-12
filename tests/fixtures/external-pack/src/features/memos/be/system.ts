import { setup } from 'xstate';
import { defineSystem, type SystemEntry } from '@abuddy/sdk/framework';
import { bus } from '@abuddy/sdk/ids';
import { emit } from '@abuddy/sdk/helpers';
import { memoCommands, memoQueries } from './repository';
import type { MemoDTO } from './types';

type IncomingMemosEvents =
  | { type: 'ADD_MEMO'; text: string };

export type OutgoingMemosEvents =
  | { type: 'MEMOS_CONNECTED'; memos: MemoDTO[] }
  | { type: 'MEMO_ADDED'; memo: MemoDTO };

export const memosSpec = defineSystem('memos')<IncomingMemosEvents, OutgoingMemosEvents>();
export const memos = memosSpec.id;

export const memosSystem = setup({
  types: memosSpec.types,
  actions: {
    sendConnectedData: ({ system }) => {
      system.get(bus).send(emit(memos, { type: 'MEMOS_CONNECTED', memos: memoQueries.all() }));
    },
    addMemo: ({ system, event }) => {
      const { text } = memosSpec.typeOf('ADD_MEMO', event);
      system.get(bus).send(emit(memos, { type: 'MEMO_ADDED', memo: memoCommands.add(text) }));
    },
  },
}).createMachine({
  id: memos,
  initial: 'idle',
  on: {
    ADD_MEMO: { actions: 'addMemo' },
  },
  states: {
    idle: {
      on: {
        CLIENT_CONNECTED: { actions: 'sendConnectedData' },
      },
    },
  },
});

const memosEntry: SystemEntry = { spec: memosSpec, machine: memosSystem };

export default memosEntry;
