import { sendToPlugin } from '@/__generated__/events';
import { repository } from '@/__generated__/repository';
import { setup } from 'xstate';
import { defineSystem, type SystemEntry } from '@abuddy/sdk/framework';
import type { SavedTab, SavedBookmark } from './types';
import { createLogger } from '@abuddy/sdk/logger';

const logger = createLogger('browser');

type IncomingBrowserEvents =
  | { type: 'SYNC_TABS'; tabs: SavedTab[] }
  | { type: 'SYNC_BOOKMARKS'; bookmarks: SavedBookmark[] };

export type OutgoingBrowserEvents =
  | { type: 'BROWSER_CONNECTED'; savedTabs: SavedTab[]; savedBookmarks: SavedBookmark[] };

export interface BrowserContext {}

export const browserSpec = defineSystem<
  IncomingBrowserEvents,
  OutgoingBrowserEvents,
  BrowserContext
>();

export const browserSystem = setup({
  types: browserSpec.types,
  actions: {
    sendBrowserConnected: () => {
      const savedTabs = repository.browserQueries.allTabs();
      const savedBookmarks = repository.browserQueries.allBookmarks();
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
      repository.browserCommands.syncTabs(ev.tabs);
    },
    syncBookmarks: ({ event }) => {
      const ev = browserSpec.typeOf('SYNC_BOOKMARKS', event);
      repository.browserCommands.syncBookmarks(ev.bookmarks);
    },
  },
}).createMachine({
  id: 'browser',
  initial: 'active',
  context: {},
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
