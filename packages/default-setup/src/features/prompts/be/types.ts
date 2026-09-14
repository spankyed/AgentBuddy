/**
 * Prompt template types and definitions
 */

import type { Category } from '@/__generated__/types';



// The SDK owns the Prompt entity and its shape
export type { PromptEntity } from '@abuddy/sdk';
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
