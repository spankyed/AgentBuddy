import type { EARS } from '@/__generated__/ears';

export type BrowserTabId = `${EARS.Entity.BrowserTab}-${string}`;

export interface BrowserTabEntity {
  id: BrowserTabId;
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
  id: BrowserTabId;
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

// ── This feature's settings ───────────────────────────────────────────────
// Its own shape, which the app stores without knowing: the app owns the document, each feature its slice.
export interface BrowserSettings {
  showBookmarksBar: boolean;
  /** Whether a link opens in the browser plugin rather than the user's own browser; defaults to true */
  openLinksInApp?: boolean;
}

export type IncomingBrowserEvents =
  | { type: 'SYNC_TABS'; tabs: SavedTab[] }
  | { type: 'SYNC_BOOKMARKS'; bookmarks: SavedBookmark[] };

export type OutgoingBrowserEvents =
  | { type: 'BROWSER_CONNECTED'; savedTabs: SavedTab[]; savedBookmarks: SavedBookmark[] };

export interface BrowserContext {}
