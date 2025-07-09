import type { FieldMapping, ExecutionContext } from '@/systems/brain/types';
import { createLogger } from '@/systems/logs/logger';

const logger = createLogger('field-mapper');

/**
 * Simple field mapper with cleaner implementation
 */

/**
 * Extract value from context using a path or function
 */
function extractValue(context: ExecutionContext, source: string | ((ctx: ExecutionContext) => any)): any {
  // If source is a function, call it with context
  if (typeof source === 'function') {
    try {
      return source(context);
    } catch (error) {
      logger.error('Function extractor failed:', { error });
      return undefined;
    }
  }
  
  // If source starts with $., treat as a JSONPath
  if (typeof source === 'string' && source.startsWith('$.')) {
    return extractValueByPath(context, source);
  }
  
  // Otherwise, it's a literal value
  // Try to parse as JSON first (for objects, arrays, booleans, numbers)
  if (typeof source === 'string') {
    try {
      return JSON.parse(source);
    } catch {
      // If parsing fails, return as string literal
      return source;
    }
  }
  
  return source;
}

/**
 * Extract value using a simple path
 * Now supports cleaner paths like:
 * - $.event.data.message
 * - $.lastStep.result
 * - $.steps[id=123].result
 * - $.steps[label=Process User Message].result
 */
function extractValueByPath(source: any, path: string): any {
  if (!path || path === '$') return source;
  
  // Remove leading $ if present
  const cleanPath = path.startsWith('$.') ? path.substring(2) : path;
  
  // Split path into segments, handling special selectors
  const segments = cleanPath.split('.');
  
  let current = source;
  for (const segment of segments) {
    if (current === null || current === undefined) return undefined;
    
    // Handle array selector like steps[id=123]
    const selectorMatch = segment.match(/^(\w+)\[(\w+)=([^\]]+)\]$/);
    if (selectorMatch) {
      const [, arrayName, field, value] = selectorMatch;
      const array = current[arrayName];
      if (Array.isArray(array)) {
        current = array.find(item => item[field] === value);
      } else {
        return undefined;
      }
    } else {
      // Normal property access
      current = current[segment];
    }
  }
  
  return current;
}

/**
 * Apply field mappings to create template parameters
 */
export function applyFieldMappings(
  mappings: FieldMapping[],
  context: ExecutionContext
): Record<string, any> {
  const result: Record<string, any> = {};
  
  // Debug log the available context
  logger.debug('Applying field mappings:', {
    eventType: context.event.type,
    eventDataKeys: Object.keys(context.event.data),
    eventData: context.event.data,
    stepsCount: context.steps.length,
    lastStepLabel: context.lastStep?.label,
    mappingsCount: mappings.length
  });
  
  for (const mapping of mappings) {
    try {
      // Extract value from source
      let value = extractValue(context, mapping.source);
      
      // Use default if undefined
      if (value === undefined && mapping.default !== undefined) {
        value = mapping.default;
      }
      
      // Set the target field
      result[mapping.target] = value;
      
      logger.debug(`Mapped ${mapping.target}:`, { 
        source: typeof mapping.source === 'function' ? '[Function]' : mapping.source,
        value 
      });
    } catch (error) {
      logger.error(`Failed to apply mapping for ${mapping.target}:`, { error, mapping });
      if (mapping.default !== undefined) {
        result[mapping.target] = mapping.default;
      }
    }
  }
  
  return result;
} 