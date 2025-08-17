/**
 * Prompt DSL Export Module
 * This module exports all types and functions needed for the Prompt DSL
 * Used to generate type definitions for Monaco Editor
 */

// Import prompt service and types
import { promptService } from '@/services/prompt';
import type { PromptEntity } from '@/systems/prompts/types';

// Export the usePrompt function directly
export async function usePrompt(
  label: string, 
  params: Record<string, any>
): Promise<string | undefined> {
  return promptService.usePrompt(label, params);
}

// Type definitions for prompt context
export interface PromptParams {
  [key: string]: any;
}

// Re-export types for better type generation
export type { PromptEntity };
export { PromptService } from '@/services/prompt';

// Global declarations for the DSL context
declare global {
  const params: PromptParams;
  function usePrompt(label: string, params: Record<string, any>): Promise<string | undefined>;
}