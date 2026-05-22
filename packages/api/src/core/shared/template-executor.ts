import { createLogger } from '@/core/shared/debug/logger';
import type { PromptContext } from './prompt-context';

const logger = createLogger('template-executor');

/**
 * Executes a prompt template function with the given parameters.
 * Templates are stored as function bodies that need to be wrapped.
 */
export function executeTemplate(
  templateFn: string,
  params: Record<string, any>,
  context?: PromptContext
): string {
  try {
    const wrappedFunction = context
      ? new Function('params', 'usePrompt', templateFn)
      : new Function('params', templateFn);

    const result = context
      ? wrappedFunction(params, context.usePrompt.bind(context))
      : wrappedFunction(params);

    if (typeof result !== 'string') {
      throw new Error('Template function must return a string');
    }

    return result;
  } catch (error) {
    logger.error('Failed to execute template:', { error, templateFn, params });
    throw new Error(`Template execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export function validateTemplate(templateFn: string): { valid: boolean; error?: string } {
  try {
    new Function('params', templateFn);
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Invalid template syntax'
    };
  }
}
