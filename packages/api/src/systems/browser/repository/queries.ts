import { findAll } from '@/core/shared/repository/query-helpers';
import { EARS } from '@/core/types';
import type { BrowserTabEntity, SavedTab } from '../types';

function toDTO(entity: BrowserTabEntity): SavedTab {
  return {
    url: entity.url,
    title: entity.title,
    favicon: entity.favicon,
    displayOrder: entity.displayOrder,
    isMuted: entity.isMuted,
  };
}

export const browserQueries = {
  allTabs: (): SavedTab[] => {
    const entities = findAll<BrowserTabEntity>(EARS.Entity.BrowserTab);
    return entities
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map(toDTO);
  },
} as const;
