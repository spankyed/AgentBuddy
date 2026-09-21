import { sendToPlugin } from '@/__generated__/events';
import { setup, fromCallback, spawnChild } from 'xstate';
import { defineSystem, type SystemEntry } from '@abuddy/sdk/framework';

import { onConnected, onIncoming, type IncomingSystemEvents } from '@abuddy/sdk/events';
import { browserQueries } from './repository/queries';
import { browserCommands } from './repository/commands';
import type { SavedTab, SavedBookmark } from './types';
import './repository/index'; // register repository
import { createLogger } from '@abuddy/sdk/logger';
import { busId } from '@/__generated__/bus-ids';

const logger = createLogger('browser');

type IncomingBrowserEvents =
  | { type: 'SYNC_TABS'; tabs: SavedTab[] }
  | { type: 'SYNC_BOOKMARKS'; bookmarks: SavedBookmark[] };

type BrowserInternalEvents =
  | { type: 'CLIENT_CONNECTED' };

export type OutgoingBrowserEvents =
  | { type: 'BROWSER_CONNECTED'; savedTabs: SavedTab[]; savedBookmarks: SavedBookmark[] };

export interface BrowserContext {}

export const browserSpec = defineSystem('browser')<
  IncomingBrowserEvents | BrowserInternalEvents,
  OutgoingBrowserEvents,
  BrowserContext
>();
/** The id this feature's system runs under, which is what `system.get(...)` takes */
export const browser = busId.browser;

export const browserSystem = setup({
  types: browserSpec.types,
  actors: {
    setupEventListeners: fromCallback(({ sendBack }) => {
      const connectedHandler = () => {
        sendBack({ type: 'CLIENT_CONNECTED' });
      };

      const incomingHandler = (event: IncomingSystemEvents) => {
        if (event.systemId === 'browser') {
          const { systemId, ...actualEvent } = event;
          sendBack(actualEvent);
        }
      };

      const onConnectedUnsub = onConnected(connectedHandler);
      const onIncomingUnsub = onIncoming(incomingHandler);

      return () => {
        onConnectedUnsub();
        onIncomingUnsub();
      };
    }),
  },
  actions: {
    setupEventListeners: spawnChild('setupEventListeners'),
    sendBrowserConnected: () => {
      const savedTabs = browserQueries.allTabs();
      const savedBookmarks = browserQueries.allBookmarks();
      logger.info('Sending browser restore payload', {
        savedTabCount: savedTabs.length,
        savedBookmarkCount: savedBookmarks.length,
      });
      sendToPlugin('browser', {
        type: 'BROWSER_CONNECTED',
        savedTabs,
        savedBookmarks,
      });
    },
    syncTabs: ({ event }) => {
      const ev = browserSpec.typeOf('SYNC_TABS', event);
      browserCommands.syncTabs(ev.tabs);
    },
    syncBookmarks: ({ event }) => {
      const ev = browserSpec.typeOf('SYNC_BOOKMARKS', event);
      browserCommands.syncBookmarks(ev.bookmarks);
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
    SYNC_TABS: {
      actions: ['syncTabs'],
    },
    SYNC_BOOKMARKS: {
      actions: ['syncBookmarks'],
    },
  },
  states: {
    active: {},
  },
});

const browserEntry = { spec: browserSpec, machine: browserSystem } satisfies SystemEntry;

export default browserEntry;
