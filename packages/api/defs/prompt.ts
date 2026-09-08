/**
 * Prompt DSL Export Module
 *
 * Type definitions for Monaco Editor prompt DSL intellisense.
 * All pack-specific types flow through generated barrels.
 */

export type { PromptEntity } from '@/__generated__/types';

export interface PromptParams {
  [key: string]: any;
}

export function usePrompt(label: string, params: Record<string, any>): string | undefined {
  throw new Error('usePrompt is only available within prompt template execution context');
}

export const params: PromptParams = new Proxy({} as PromptParams, {
  get() {
    throw new Error('params is only available within prompt template execution context');
  }
});
