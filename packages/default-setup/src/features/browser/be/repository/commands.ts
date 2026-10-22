import { query, create, upsert, write } from '#generated/ears.ts';

import { EARS } from '#generated/ears.ts';
import type { BrowserTabId, SavedTab, SavedBookmark } from '../types.ts';
import { normalizeSavedTabs } from './normalize-tabs.ts';
import { createLogger } from '@apackdev/sdk/logger';

const logger = createLogger('browser');

export const browserCommands = {
  syncTabs: (tabs: SavedTab[]): void => {
    const normalized = normalizeSavedTabs(tabs);
    if (normalized.invalidCount > 0 || normalized.duplicateIdCount > 0) {
      logger.warn('Repairing browser tabs during sync', {
        rawCount: tabs.length,
        repairedCount: normalized.tabs.length,
        invalidCount: normalized.invalidCount,
        duplicateIdCount: normalized.duplicateIdCount,
      });
    }

    const existingIds = query(EARS.Entity.BrowserTab).ids() as BrowserTabId[];
    const incomingIds = new Set(normalized.tabs.map(tab => tab.id));
    for (const id of existingIds) {
      if (!incomingIds.has(id)) {
        write(id).destroy();
      }
    }

    for (const tab of normalized.tabs) {
      upsert(EARS.Entity.BrowserTab, tab.id).setMany({
        url: tab.url,
        title: tab.title,
        favicon: tab.favicon,
        displayOrder: tab.displayOrder,
        isMuted: tab.isMuted,
        groupId: tab.groupId ?? '',
        updatedAt: Date.now(),
      });
    }
  },
  syncBookmarks: (bookmarks: SavedBookmark[]): void => {
    const existingIds = query(EARS.Entity.BrowserBookmark).ids();
    for (const id of existingIds) {
      write(id).destroy();
    }

    for (const bm of bookmarks) {
      create(EARS.Entity.BrowserBookmark).setMany({
        url: bm.url,
        title: bm.title,
        favicon: bm.favicon,
        displayOrder: bm.displayOrder,
        updatedAt: Date.now(),
      });
    }
  },
} as const;
