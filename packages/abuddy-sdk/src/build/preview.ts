export type SetupPackItemKind = 'collection' | 'document' | 'tasklist' | 'task';

export interface SetupPackPreviewItem {
  key: string;
  description?: string;
  kind?: SetupPackItemKind;
  childCount?: number;
}

export interface SetupPackPreview {
  directory: string;
  seeds: Record<string, SetupPackPreviewItem[]>;
  missing: string[];
}

/** @deprecated Use SetupPackPreview['seeds'] indexing instead */
export type SetupPackType = 'actions' | 'prompts' | 'flows' | 'library' | 'notes' | 'settings';
