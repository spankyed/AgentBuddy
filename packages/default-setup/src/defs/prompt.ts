/**
 * Prompt DSL type surface for Monaco intellisense.
 * Defines what's available as globals in the prompt code editor.
 * Stubs throw at runtime — they exist only for their type signatures.
 */

export type { PromptEntity } from '@/__generated__/types';

export type PromptParams = Record<string, any>;

export function usePrompt(_label: string, _params: Record<string, any>): string | undefined {
  throw new Error('usePrompt is only available within prompt template execution context');
}

export const params: PromptParams = new Proxy({} as PromptParams, {
  get() { throw new Error('params is only available within prompt template execution context'); },
});
