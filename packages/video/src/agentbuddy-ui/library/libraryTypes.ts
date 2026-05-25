export type LibraryItemType = 'document' | 'folder';

export type LibraryItemState = {
  children?: LibraryItemState[];
  expanded?: boolean;
  filePath?: string;
  id: string;
  isBroken?: boolean;
  isSymlink?: boolean;
  kind: string;
  name: string;
  selected?: boolean;
  shortCode?: string;
  size: string;
  tags?: string[];
  type: LibraryItemType;
  updatedAt: string;
};

export type LibraryBreadcrumbState = {
  id: string | null;
  name: string;
};

export type LibraryPanelState = {
  allTags: Array<{count: number; name: string; tone: 'blue' | 'purple' | 'green'}>;
  documentsCount: number;
  foldersCount: number;
  selectedItem?: LibraryItemState;
};

export type LibrarySurfaceState = {
  breadcrumbs: LibraryBreadcrumbState[];
  currentFolderId: string | null;
  items: LibraryItemState[];
  panel: LibraryPanelState;
  selectedItemIds: string[];
  sortBy: 'name' | 'modified' | 'size' | 'kind';
  sortDirection: 'asc' | 'desc';
};
