
import type { ActionEntity } from '@abuddy/sdk';

export interface ActionsStartupData {
  actions: ActionEntity[];
  page: number;
  totalPages: number;
  totalCount: number;
  categories?: Category[];
}

// ── This feature's settings ───────────────────────────────────────────────
// Its own shape, which the app stores without knowing: the app owns the document, each feature its slice.
export interface Category {
  name: string;
  color: string; // Hex color value
}

export interface ActionsSettings {
  categories: Category[];
}
