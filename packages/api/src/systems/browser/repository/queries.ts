import { findAll } from '@/core/shared/repository/query-helpers';
import { EARS } from '@/core/types';
import type { BrowserTabEntity, SavedTab, BrowserBookmarkEntity, SavedBookmark } from '../types';

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
    return entities
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map(tabToDTO);
  },
  allBookmarks: (): SavedBookmark[] => {
    const entities = findAll<BrowserBookmarkEntity>(EARS.Entity.BrowserBookmark);
    return entities
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map(bookmarkToDTO);
  },
} as const;
