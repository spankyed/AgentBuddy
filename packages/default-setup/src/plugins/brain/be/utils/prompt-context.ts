import { brainLogger } from './brain-inspect';

export interface PromptContext {
  usePrompt(label: string, params: Record<string, any>): string | undefined;
}

const MAX_EXECUTION_DEPTH = 10;

export function createPromptContext(
  executeTemplateFn: (templateFn: string, params: Record<string, any>, context?: PromptContext) => string,
  getPromptByLabel: (label: string) => { templateFn: string } | undefined,
  currentDepth: number = 0,
): PromptContext {
  return {
    usePrompt(label: string, params: Record<string, any>): string | undefined {
      if (currentDepth >= MAX_EXECUTION_DEPTH) {
        brainLogger.error('Maximum prompt execution depth exceeded', {
          label, currentDepth, maxDepth: MAX_EXECUTION_DEPTH,
        });
        throw new Error(`Maximum prompt execution depth (${MAX_EXECUTION_DEPTH}) exceeded. Possible circular reference detected.`);
      }

      const prompt = getPromptByLabel(label);
      if (!prompt) {
        brainLogger.warn('Referenced prompt not found:', { label });
        return undefined;
      }

      const nestedContext = createPromptContext(executeTemplateFn, getPromptByLabel, currentDepth + 1);
      return executeTemplateFn(prompt.templateFn, params, nestedContext);
    },
  };
}