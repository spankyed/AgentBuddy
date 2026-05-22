import { createLogger } from '@/core/helpers/debug/logger';

const logger = createLogger('prompt-context');

export interface PromptContext {
  usePrompt(label: string, params: Record<string, any>): string | undefined;
}

const MAX_EXECUTION_DEPTH = 10;

/**
 * Creates a prompt context for template execution.
 * @param executeTemplateFn - Function to execute template strings
 * @param getPromptByLabel - Injected query function to look up prompts by label
 * @param currentDepth - Current recursion depth for loop prevention
 */
export function createPromptContext(
  executeTemplateFn: (templateFn: string, params: Record<string, any>, context?: PromptContext) => string,
  getPromptByLabel: (label: string) => { templateFn: string } | undefined,
  currentDepth: number = 0
): PromptContext {
  return {
    usePrompt(label: string, params: Record<string, any>): string | undefined {
      if (currentDepth >= MAX_EXECUTION_DEPTH) {
        logger.error('Maximum prompt execution depth exceeded', {
          label, currentDepth, maxDepth: MAX_EXECUTION_DEPTH
        });
        throw new Error(`Maximum prompt execution depth (${MAX_EXECUTION_DEPTH}) exceeded. Possible circular reference detected.`);
      }

      const prompt = getPromptByLabel(label);
      if (!prompt) {
        logger.warn('Referenced prompt not found:', { label });
        return undefined;
      }

      const nestedContext = createPromptContext(executeTemplateFn, getPromptByLabel, currentDepth + 1);
      return executeTemplateFn(prompt.templateFn, params, nestedContext);
    }
  };
}
