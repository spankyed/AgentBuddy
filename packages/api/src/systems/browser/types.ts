import type { EARS } from '@/core/types';

export interface BrowserTabEntity {
  id: EARS.EntityId;
  entityType: EARS.Entity.BrowserTab;
  url: string;
  title: string;
  favicon: string;
  displayOrder: number;
  isMuted: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface SavedTab {
  url: string;
  title: string;
  favicon: string;
  displayOrder: number;
  isMuted: boolean;
}
