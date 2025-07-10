import { createLogger } from '@/shared/debug/logger';

const logger = createLogger('template-executor');

/**
 * Executes a prompt template function with the given parameters
 * Templates are stored as function bodies that need to be wrapped
 */
export function executeTemplate(templateFn: string, params: Record<string, any>): string {
  try {
    // Wrap the template body in a function
    const wrappedFunction = new Function('params', templateFn);
    
    // Execute the function with the provided parameters
    const result = wrappedFunction(params);
    
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