import { createLogger } from '@/core/shared/debug/logger';
import type { PromptContext } from './prompt-context';

const logger = createLogger('template-executor');

/**
 * Executes a prompt template function with the given parameters
 * Templates are stored as function bodies that need to be wrapped
 * @param templateFn - The template function body as a string
 * @param params - Parameters to pass to the template
 * @param context - Optional context providing access to other prompts
 */
export function executeTemplate(
  templateFn: string, 
  params: Record<string, any>,
  context?: PromptContext
): string {
  try {
    // Wrap the template body in a function
    // If context is provided, inject usePrompt directly
    const wrappedFunction = context 
      ? new Function('params', 'usePrompt', templateFn)
      : new Function('params', templateFn);
    
    // Execute the function with the provided parameters
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

/**
 * Validates that a template function is syntactically correct
 */
export function validateTemplate(templateFn: string): { valid: boolean; error?: string } {
  try {
    // Try to create the function to check syntax
    new Function('params', templateFn);
    return { valid: true };
  } catch (error) {
    return { 
      valid: false, 
      error: error instanceof Error ? error.message : 'Invalid template syntax' 
    };
  }
}