import type { EARS } from '@/core/types';

export interface BrowserTabEntity {
  id: EARS.EntityId;
  entityType: EARS.Entity.BrowserTab;
  url: string;
  title: string;
  favicon: string;
  displayOrder: number;
  isMuted: boolean;
  groupId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface SavedTab {
  url: string;
  title: string;
  favicon: string;
  displayOrder: number;
  isMuted: boolean;
  groupId?: string;
}

export interface BrowserBookmarkEntity {
  id: EARS.EntityId;
  entityType: EARS.Entity.BrowserBookmark;
  url: string;
  title: string;
  favicon: string;
  displayOrder: number;
  createdAt: number;
  updatedAt: number;
}

export interface SavedBookmark {
  url: string;
  title: string;
  favicon: string;
  displayOrder: number;
}
