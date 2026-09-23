/**
 * Prompt template types and definitions
 */

import type { Category } from '@/__generated__/types';



import type { PromptEntity } from '@abuddy/sdk';

/**
 * Data sent on prompts system connection
 */
export interface PromptsConnectedData {
  prompts: PromptEntity[];
  page: number;
  totalPages: number;
  totalCount: number;
  categories?: Category[];
}

// ── This feature's settings ───────────────────────────────────────────────
// Its own shape, which the app stores without knowing: the app owns the document, each feature its slice.
export interface PromptsSettings {
  categories: Category[];
}
