/**
 * Prompt template types and definitions
 */

import type { BaseEntity, EARS } from '@/core/types';
import type { Category } from './settings';

/**
 * Defines an input parameter that a prompt template expects
 */
export interface TemplateInput {
  name: string;                    // Input name (e.g., "userMessage")
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any';
  description?: string;            // What this input is for
  required?: boolean;              // Default true
  defaultValue?: any;              // Default if not provided

  // Hints for UI/mapping system
  commonSources?: string[];        // Common paths this might come from
  example?: any;                   // Example value
}


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
