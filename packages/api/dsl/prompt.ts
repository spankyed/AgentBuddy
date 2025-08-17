/**
 * Prompt DSL Export Module
 * This module exports all types and functions needed for the Prompt DSL
 * Used to generate type definitions for Monaco Editor
 */

// Import prompt service and types
export { PromptService } from '@/services/prompt';
export type { PromptEntity } from '@/systems/prompts/types';

// Import and export prompt context for type reference
export type { PromptContext } from '@/systems/brain/utils/prompt-context';

// Type definitions for prompt context
export interface PromptParams {
  [key: string]: any;
}

// Export runtime placeholders for Monaco Editor intellisense
// These will be available when the module is imported
export function usePrompt(label: string, params: Record<string, any>): string | undefined {
  // This is a placeholder implementation for type definitions
  // The actual implementation is provided by the prompt context at runtime
  throw new Error('usePrompt is only available within prompt template execution context');
}

export const params: PromptParams = new Proxy({} as PromptParams, {
  get() {
    throw new Error('params is only available within prompt template execution context');
  }
});