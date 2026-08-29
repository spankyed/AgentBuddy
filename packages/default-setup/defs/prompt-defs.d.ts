export { PromptService } from '@/systems/prompts/services/prompt';
export { PromptEntity } from '@/systems/prompts/types';
export { PromptContext } from '@/systems/brain/utils/prompt-context';

/**
 * Prompt DSL Export Module
 * This module exports all types and functions needed for the Prompt DSL
 * Used to generate type definitions for Monaco Editor
 */

interface PromptParams {
    [key: string]: any;
}
declare function usePrompt(label: string, params: Record<string, any>): string | undefined;
declare const params: PromptParams;

export { params, usePrompt };
export type { PromptParams };
