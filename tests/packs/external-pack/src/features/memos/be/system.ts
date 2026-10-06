import type { Contract } from './contract.ts';
import { broadcastToPlugin } from '#generated/events.ts';
import { setup } from 'xstate';
import { defineSystem } from '@abuddy/sdk/framework';

import { repository } from '#generated/repository.ts';
import { addMemoNote } from './memo-notes.ts';

export const memosSpec = defineSystem<Contract>();

export const memosSystem = setup({
  types: memosSpec.types,
  actions: memosSpec.actions({
    sendConnectedData: () => {
      broadcastToPlugin('memos', { type: 'MEMOS_CONNECTED', memos: repository.memoQueries.all() });
    },
    addMemo: ({ event }) => {
      const { text } = memosSpec.typeOf('ADD_MEMO', event);
      broadcastToPlugin('memos', { type: 'MEMO_ADDED', memo: repository.memoCommands.add(text) });
    },
    // A send to a dependency's plugin, named as code names another pack's feature; that plugin declares it takes it
    announceMemo: ({ event }) => {
      const { text } = memosSpec.typeOf('ANNOUNCE_MEMO', event);
      broadcastToPlugin('default-setup/logs', {
        type: 'LOG_ADDED',
        log: { id: `memo-${Date.now()}`, timestamp: Date.now(), level: 'info', message: text, source: 'memos' },
      });
    },
    addMemoNote: ({ event }) => {
      const { text } = memosSpec.typeOf('ADD_MEMO_NOTE', event);
      broadcastToPlugin('memos', { type: 'MEMO_NOTE_ADDED', text, note: addMemoNote(text) });
    },
  }),
}).createMachine({
  id: 'memos',
  initial: 'idle',
  on: {
    ADD_MEMO: { actions: 'addMemo' },
    ADD_MEMO_NOTE: { actions: 'addMemoNote' },
    ANNOUNCE_MEMO: { actions: 'announceMemo' },
  },
  states: {
    idle: {
      on: {
        SEND_STATE: { actions: 'sendConnectedData' },
      },
    },
  },
});

const memosEntry = { spec: memosSpec, machine: memosSystem };

export default memosEntry;
