export type LibraryItem = {
  id: string;
  kind: 'command' | 'document' | 'faq' | 'snippet';
  status?: string;
  title: string;
  updatedAt: string;
};

export type LibrarySurfaceState = {
  activeCollectionId: string;
  activeItemId: string;
  collections: Array<{count: number; id: string; label: string}>;
  items: LibraryItem[];
  preview: {
    body: string[];
    metadata: Array<{label: string; value: string}>;
    title: string;
  };
};
