/**
 * Prompt template types and definitions
 */

import type { BaseEntity, EARS } from '@/__generated__/ears';
import type { Category } from '@/__generated__/types';

import type { TemplateInput } from '@abuddy/sdk/build';


/**
 * Defines a prompt entity stored in the system
 */
export interface PromptEntity extends BaseEntity {
  entityType: EARS.Entity.Prompt;
  label: string;
  description?: string;
  category?: string;
  inputs: Record<string, TemplateInput>;
  templateFn: string;  // Stored as string, evaluated at runtime
  outputSchema?: any;  // Optional JSON schema for structured output
  /** SHA256 hash of DSL source at last seed. Absent on user-created prompts. */
  sourceHash?: string;
  createdAt: number;
  updatedAt: number;
}

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
