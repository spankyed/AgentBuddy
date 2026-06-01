import { tx } from '@/core/ears/helpers/transaction';
import { qx } from '@/core/ears/helpers/query';
import { EARS } from '@/core/types';
import type { SavedTab } from '../types';

export const browserCommands = {
  syncTabs: (tabs: SavedTab[]): void => {
    // Delete all existing BrowserTab entities
    const existingIds = qx(EARS.Entity.BrowserTab).ids();
    for (const id of existingIds) {
      tx(id).destroy();
    }

    // Create new entities from the payload
    for (const tab of tabs) {
      const id = tx(EARS.Entity.BrowserTab).id();
      tx(id).batchPut({
        entityType: EARS.Entity.BrowserTab,
        url: tab.url,
        title: tab.title,
        favicon: tab.favicon,
        displayOrder: tab.displayOrder,
        isMuted: tab.isMuted,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  },
} as const;
