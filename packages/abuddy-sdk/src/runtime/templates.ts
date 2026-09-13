import { createLogger } from '../logger/index.js';

const logger = createLogger('templates');

/**
 * A resolver that can look up and execute other templates by name,
 * enabling nested template references with depth protection.
 */
export interface TemplateResolver {
  resolve(name: string, params: Record<string, any>): string | undefined;
}

/**
 * Execute a JS function body string with named parameters.
 * The function body receives `params` and an optional `resolve` function
 * for nested template lookups.
 */
export function executeTemplate(
  fnBody: string,
  params: Record<string, any>,
  resolver?: TemplateResolver
): string {
  try {
    const wrappedFunction = resolver
      ? new Function('params', 'usePrompt', fnBody)
      : new Function('params', fnBody);

    const result = resolver
      ? wrappedFunction(params, resolver.resolve.bind(resolver))
      : wrappedFunction(params);

    if (typeof result !== 'string') {
      throw new Error('Template function must return a string');
    }

    return result;
  } catch (error) {
    logger.error('Failed to execute template:', { error, fnBody, params });
    throw new Error(`Template execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Validate that a template function body is syntactically correct.
 */
export function validateTemplate(fnBody: string): { valid: boolean; error?: string } {
  try {
    new Function('params', fnBody);
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Invalid template syntax'
    };
  }
}

/**
 * Create a resolver that looks up templates by name and executes them,
 * with depth-limited recursion to catch circular references.
 */
export function createTemplateResolver(
  executeFn: (fnBody: string, params: Record<string, any>, resolver?: TemplateResolver) => string,
  lookup: (name: string) => { templateFn: string } | undefined,
  maxDepth: number = 10,
  currentDepth: number = 0,
): TemplateResolver {
  return {
    resolve(name: string, params: Record<string, any>): string | undefined {
      if (currentDepth >= maxDepth) {
        logger.error('Maximum template resolution depth exceeded', {
          name, currentDepth, maxDepth,
        });
        throw new Error(`Maximum template resolution depth (${maxDepth}) exceeded. Possible circular reference detected.`);
      }

      const template = lookup(name);
      if (!template) {
        logger.warn('Referenced template not found:', { name });
        return undefined;
      }

      const nestedResolver = createTemplateResolver(executeFn, lookup, maxDepth, currentDepth + 1);
      return executeFn(template.templateFn, params, nestedResolver);
    },
  };
}
