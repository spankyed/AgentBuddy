import { findAll } from '@/core/shared/repository/query-helpers';
import { EARS } from '@/core/types';
import type { BrowserTabEntity, SavedTab, BrowserBookmarkEntity, SavedBookmark } from '../types';
import { normalizeSavedTabs } from './normalize-tabs';
import { browserCommands } from './commands';
import { createLogger } from '@/core/shared/debug/logger';

const logger = createLogger('browser');

function tabToDTO(entity: BrowserTabEntity): SavedTab {
  return {
    url: entity.url,
    title: entity.title,
    favicon: entity.favicon,
    displayOrder: entity.displayOrder,
    isMuted: entity.isMuted,
    groupId: entity.groupId,
  };
}

function bookmarkToDTO(entity: BrowserBookmarkEntity): SavedBookmark {
  return {
    url: entity.url,
    title: entity.title,
    favicon: entity.favicon,
    displayOrder: entity.displayOrder,
  };
}

export const browserQueries = {
  allTabs: (): SavedTab[] => {
    const entities = findAll<BrowserTabEntity>(EARS.Entity.BrowserTab);
    const rawTabs = entities
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map(tabToDTO);
    const normalized = normalizeSavedTabs(rawTabs);

    if (normalized.invalidCount > 0 || normalized.duplicateCount > 0) {
      logger.warn('Repairing persisted browser tabs', {
        rawCount: rawTabs.length,
        repairedCount: normalized.tabs.length,
        invalidCount: normalized.invalidCount,
        duplicateCount: normalized.duplicateCount,
      });
      browserCommands.syncTabs(normalized.tabs);
    }

    return normalized.tabs;
  },
  allBookmarks: (): SavedBookmark[] => {
    const entities = findAll<BrowserBookmarkEntity>(EARS.Entity.BrowserBookmark);
    return entities
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map(bookmarkToDTO);
  },
} as const;
