import { EARS } from '@/__generated__/ears';
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

export type IncomingPromptEvents =
  | { type: 'PROMPT_SELECT'; promptId: string }
  | { type: 'CREATE_PROMPT'; label: string; inputs: Record<string, any>; templateFn: string; outputSchema?: any; description?: string; category?: string }
  | { type: 'UPDATE_PROMPT'; promptId: string; label?: string; inputs?: Record<string, any>; templateFn?: string; outputSchema?: any; description?: string; category?: string }
  | { type: 'DELETE_PROMPT'; promptId: string }
  | { type: 'FETCH_PROMPTS_PAGE'; page?: number }
  | { type: 'FETCH_ALL_PROMPTS' }
  | { type: 'IMPORT_PROMPTS'; prompts: any }
  | { type: 'EXPORT_PROMPTS'; directory: string }

export type OutgoingPromptEvents =
  | { type: 'PROMPTS_CONNECTED'; data: PromptsConnectedData }
  | { type: 'PROMPT_SELECTED'; promptId: EARS.EntityId; data: PromptEntity }
  | { type: 'PROMPT_CREATED'; prompt: PromptEntity; promptId: EARS.EntityId }
  | { type: 'PROMPT_UPDATED'; prompt: PromptEntity; promptId: EARS.EntityId }
  | { type: 'PROMPT_DELETED'; promptId: EARS.EntityId }
  | { type: 'PROMPTS_PAGE_LOADED'; data: { prompts: PromptEntity[]; page: number; totalPages: number } }
  | { type: 'PROMPTS_ALL_LOADED'; data: { prompts: PromptEntity[] } }
  | { type: 'PROMPTS_IMPORTED'; count: number; errors?: string[] }
  | { type: 'PROMPTS_IMPORT_FAILED'; errors: string[] }
  | { type: 'PROMPTS_EXPORTED'; filePath: string; promptCount: number }
  | { type: 'PROMPTS_EXPORT_FAILED'; errors: string[] }
