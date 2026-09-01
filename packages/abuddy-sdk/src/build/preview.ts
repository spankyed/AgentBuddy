export type SetupPackType = 'actions' | 'prompts' | 'flows' | 'library' | 'notes' | 'settings';

export type SetupPackItemKind = 'collection' | 'document' | 'tasklist' | 'task';

export interface SetupPackPreviewItem {
  key: string;
  description?: string;
  kind?: SetupPackItemKind;
  childCount?: number;
}

export interface SetupPackPreview {
  directory: string;
  actions: SetupPackPreviewItem[];
  prompts: SetupPackPreviewItem[];
  flows: SetupPackPreviewItem[];
  library: SetupPackPreviewItem[];
  notes: SetupPackPreviewItem[];
  settings: SetupPackPreviewItem[];
  missing: SetupPackType[];
}
