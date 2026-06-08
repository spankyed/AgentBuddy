import { setup, fromCallback, spawnChild } from 'xstate';
import { defineSystem } from '@/core/framework/define-system';
import { emit } from '@/core/shared/actor-helpers';
import { rootEvents } from '@/core/router/bus-emitter';
import type { IncomingSystemEvents } from '@/core/router/events';
import { browserQueries } from './repository/queries';
import { browserCommands } from './repository/commands';
import type { SavedTab, SavedBookmark } from './types';
import './repository/index'; // register repository
import { createLogger } from '@/core/shared/debug/logger';

const logger = createLogger('browser');

type IncomingBrowserEvents =
  | { type: 'SYNC_TABS'; tabs: SavedTab[] }
  | { type: 'SYNC_BOOKMARKS'; bookmarks: SavedBookmark[] };

type BrowserInternalEvents =
  | { type: 'CLIENT_CONNECTED' };

export type OutgoingBrowserEvents =
  | { type: 'BROWSER_CONNECTED'; savedTabs: SavedTab[]; savedBookmarks: SavedBookmark[] };

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

      const incomingHandler = (event: IncomingSystemEvents) => {
        if (event.systemId === 'browser') {
          const { systemId, ...actualEvent } = event;
          sendBack(actualEvent);
        }
      };

      const onConnectedUnsub = rootEvents.onConnected(connectedHandler);
      const onIncomingUnsub = rootEvents.onIncoming(incomingHandler);

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
      const wrapped = emit(browser, {
        type: 'BROWSER_CONNECTED',
        savedTabs,
        savedBookmarks,
      });
      rootEvents.emitOutgoing(wrapped.event);
    },
    syncTabs: ({ event }) => {
      const ev = browserDef.typeOf('SYNC_TABS', event);
      browserCommands.syncTabs(ev.tabs);
    },
    syncBookmarks: ({ event }) => {
      const ev = browserDef.typeOf('SYNC_BOOKMARKS', event);
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
