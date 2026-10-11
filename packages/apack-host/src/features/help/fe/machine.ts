import { assign, setup, type ActorRefFrom } from 'xstate';
import { breadcrumb } from '@apackdev/sdk/fe';
import type { HelpCatalog, HelpTarget } from '@apackdev/sdk/framework';
import { sendToSystem } from '../../../events.ts';

export interface HelpContext {
  catalog: HelpCatalog;
  target: HelpTarget;
  history: HelpTarget[];
  query: string;
  loading: boolean;
}
export type HelpEvent =
  | { type: 'CLIENT_CONNECTED' }
  | { type: 'HELP_CATALOG'; catalog: HelpCatalog }
  | { type: 'HELP.OPEN'; target: HelpTarget }
  | { type: 'HELP.BACK' }
  | { type: 'HELP.SEARCH'; query: string };
export const helpMachine = setup({ types: { context: {} as HelpContext, events: {} as HelpEvent } }).createMachine({
  id: 'help',
  context: { catalog: { articles: [], problems: [] }, target: {}, history: [], query: '', loading: true },
  initial: 'ready',
  states: { ready: { meta: breadcrumb('ready', 'Help', true) } },
  entry: () => sendToSystem('help', { type: 'GET_HELP' }),
  on: {
    CLIENT_CONNECTED: { actions: () => sendToSystem('help', { type: 'GET_HELP' }) },
    HELP_CATALOG: { actions: assign(({ event }) => ({ catalog: event.catalog, loading: false })) },
    'HELP.OPEN': { actions: assign(({ context, event }) => ({ target: event.target, history: [...context.history, context.target], query: '' })) },
    'HELP.BACK': { actions: assign(({ context }) => ({ target: context.history.at(-1) ?? {}, history: context.history.slice(0, -1), query: '' })) },
    'HELP.SEARCH': { actions: assign(({ event }) => ({ query: event.query, target: {}, history: [] })) },
  },
});
export type HelpState = ActorRefFrom<typeof helpMachine>;
