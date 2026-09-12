export type PackSeedItemKind = 'collection' | 'document' | 'tasklist' | 'task';

export interface PackSeedPreviewItem {
  key: string;
  description?: string;
  kind?: PackSeedItemKind;
  childCount?: number;
}

export interface PackSeedsPreview {
  directory: string;
  seeds: Record<string, PackSeedPreviewItem[]>;
  missing: string[];
}

export type PackSeedType = 'actions' | 'prompts' | 'flows' | 'library' | 'notes' | 'settings';
