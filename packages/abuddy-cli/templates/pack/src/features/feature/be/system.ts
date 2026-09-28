import { setup } from 'xstate';
import { defineSystem } from '@abuddy/sdk/framework';
// broadcastToPlugin is typed with the events each of this pack's plugins receives
import { broadcastToPlugin } from '#generated/events.ts';
import type { Contract } from './contract.ts';

export const __CAMEL__Spec = defineSystem<Contract>();

export const __CAMEL__System = setup({
  types: __CAMEL__Spec.types,
  actions: {
    sendConnectedData: () => {
      broadcastToPlugin('__NAME__', {
        type: '__CONNECTED_EVENT__',
        data: {},
      });
    },
  },
}).createMachine({
  id: '__NAME__',
  initial: 'idle',
  states: {
    idle: {
      on: {
        // Every system gets CLIENT_CONNECTED, and answers it with the data its plugin starts from
        CLIENT_CONNECTED: { actions: 'sendConnectedData' },
        // A contract's `incoming` says what may be sent; the bus routes an event to a system only if its
        // machine names it, so an event declared and never handled here is dropped
        __REFRESH_EVENT__: { actions: 'sendConnectedData' },
      },
    },
  },
});

// The manifest loads this default export. Nothing to annotate: the events come from the contract above, and the
// generated pack entry checks that this spec was built from the one abuddy.json names.
export default { spec: __CAMEL__Spec, machine: __CAMEL__System };
