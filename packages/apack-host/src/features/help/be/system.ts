import { setup } from 'xstate';
import { defineSystem, getPackHelp, type HelpCatalog } from '@apackdev/sdk/framework';
import { broadcastToPlugin } from '../../../events.ts';

export type HelpOutgoing = { type: 'HELP_CATALOG'; catalog: HelpCatalog };
export type Contract = {
  context: Record<string, never>;
  incoming: { type: 'GET_HELP' } | { type: 'CLIENT_CONNECTED' } | { type: 'PACK_CHANGED'; packId: string };
  internal: never;
  outgoing: HelpOutgoing;
};
const spec = defineSystem<Contract>();
export const helpSystem = setup({
  types: spec.types,
  actions: { sendCatalog: () => broadcastToPlugin('settings', { type: 'HELP_CATALOG', catalog: getPackHelp() }) },
}).createMachine({
  id: 'help', context: {},
  on: {
    GET_HELP: { actions: 'sendCatalog' },
    CLIENT_CONNECTED: { actions: 'sendCatalog' },
    PACK_CHANGED: { actions: 'sendCatalog' },
  },
});
export const helpEvents = ['GET_HELP', 'CLIENT_CONNECTED', 'PACK_CHANGED'] as const;
