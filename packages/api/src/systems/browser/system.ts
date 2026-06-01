import { setup, fromCallback, spawnChild } from 'xstate';
import { defineSystem } from '@/core/framework/define-system';
import { emit } from '@/core/shared/actor-helpers';
import { rootEvents } from '@/core/router/bus-emitter';

type IncomingBrowserEvents =
  | { type: 'EMPTY' };

type BrowserInternalEvents =
  | { type: 'CLIENT_CONNECTED' };

export type OutgoingBrowserEvents =
  | { type: 'BROWSER_CONNECTED' };

export interface BrowserContext {}

export const browserDef = defineSystem('browser')<
  IncomingBrowserEvents | BrowserInternalEvents,
  OutgoingBrowserEvents,
  BrowserContext
>();
export const browser = browserDef.id;

export const browserSystem = setup({
  types: browserDef.types,
  actors: {
    setupEventListeners: fromCallback(({ sendBack }) => {
      const connectedHandler = () => {
        sendBack({ type: 'CLIENT_CONNECTED' });
      };

      const onConnectedUnsub = rootEvents.onConnected(connectedHandler);

      return () => {
        onConnectedUnsub();
      };
    }),
  },
  actions: {
    setupEventListeners: spawnChild('setupEventListeners'),
    sendBrowserConnected: () => {
      const wrapped = emit(browser, {
        type: 'BROWSER_CONNECTED',
      });
      rootEvents.emitOutgoing(wrapped.event);
    },
  },
}).createMachine({
  id: browser,
  initial: 'active',
  context: {},
  entry: ['setupEventListeners'],
  on: {
    CLIENT_CONNECTED: {
      actions: ['sendBrowserConnected'],
    },
  },
  states: {
    active: {},
  },
});
