import { repository } from '@/repository';
import { createLogger } from '@/core/utils/debug/logger';

const logger = createLogger('prompt-context');

/**
 * Context provided to prompt templates for accessing other prompts
 */
export interface PromptContext {
  /**
   * Use another prompt template with the given parameters
   * @param label - The label of the prompt to use
   * @param params - Parameters to pass to the prompt template
   * @returns The executed prompt string or undefined if prompt not found
   */
  usePrompt(label: string, params: Record<string, any>): string | undefined;
}

/**
 * Maximum depth for recursive prompt execution to prevent infinite loops
 */
const MAX_EXECUTION_DEPTH = 10;

/**
 * Creates a prompt context for template execution
 * @param executeTemplateFn - Function to execute template strings
 * @param currentDepth - Current recursion depth for loop prevention
 */
export function createPromptContext(
  executeTemplateFn: (templateFn: string, params: Record<string, any>, context?: PromptContext) => string,
  currentDepth: number = 0
): PromptContext {
  return {
    usePrompt(label: string, params: Record<string, any>): string | undefined {
      // Check recursion depth
      if (currentDepth >= MAX_EXECUTION_DEPTH) {
        logger.error('Maximum prompt execution depth exceeded', { 
          label, 
          currentDepth, 
          maxDepth: MAX_EXECUTION_DEPTH 
        });
        throw new Error(`Maximum prompt execution depth (${MAX_EXECUTION_DEPTH}) exceeded. Possible circular reference detected.`);
      }
      
      // logger.debug('Using referenced prompt:', { label, params, depth: currentDepth });
      
      const prompt = repository.promptQueries.byLabel(label);
      if (!prompt) {
        logger.warn('Referenced prompt not found:', { label });
        return undefined;
      }
      
      try {
        // Create a new context with incremented depth
        const nestedContext = createPromptContext(executeTemplateFn, currentDepth + 1);
        
        // Execute the referenced template with the nested context
        const result = executeTemplateFn(prompt.templateFn, params, nestedContext);
        
        // logger.debug('Referenced prompt executed successfully:', { 
        //   label, 
        //   resultLength: result.length 
        // });
        
        return result;
      } catch (error) {
        // logger.error('Failed to execute referenced prompt:', { 
        //   label, 
        //   error, 
        //   depth: currentDepth 
        // });
        throw error;
      }
    }
  };
}