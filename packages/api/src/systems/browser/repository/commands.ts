import { tx } from '@/core/ears/helpers/transaction';
import { qx } from '@/core/ears/helpers/query';
import { EARS } from '@/core/types';
import type { SavedTab, SavedBookmark } from '../types';
import { normalizeSavedTabs } from './normalize-tabs';
import { createLogger } from '@/core/shared/debug/logger';

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

    const existingIds = qx(EARS.Entity.BrowserTab).ids();
    const incomingIds = new Set(normalized.tabs.map(tab => tab.id));
    for (const id of existingIds) {
      if (!incomingIds.has(id)) {
        tx(id).destroy();
      }
    }

    const existingSet = new Set(existingIds);
    for (const tab of normalized.tabs) {
      const now = Date.now();
      const transaction = existingSet.has(tab.id) ? tx(tab.id) : tx(tab.id, true);
      transaction.batchPut({
        entityType: EARS.Entity.BrowserTab,
        url: tab.url,
        title: tab.title,
        favicon: tab.favicon,
        displayOrder: tab.displayOrder,
        isMuted: tab.isMuted,
        groupId: tab.groupId ?? '',
        updatedAt: now,
        ...(existingSet.has(tab.id) ? {} : { createdAt: now }),
      });
    }
  },
  syncBookmarks: (bookmarks: SavedBookmark[]): void => {
    const existingIds = qx(EARS.Entity.BrowserBookmark).ids();
    for (const id of existingIds) {
      tx(id).destroy();
    }

    for (const bm of bookmarks) {
      const id = tx(EARS.Entity.BrowserBookmark).id();
      tx(id).batchPut({
        entityType: EARS.Entity.BrowserBookmark,
        url: bm.url,
        title: bm.title,
        favicon: bm.favicon,
        displayOrder: bm.displayOrder,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  },
} as const;
