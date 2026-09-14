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
