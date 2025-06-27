import type { FieldMapping, ExecutionContext } from '@/systems/brain/types';
import { createLogger } from '@/systems/logs/logger';

const logger = createLogger('field-mapper');

/**
 * Simple field mapper - "dumb" logic that just applies mappings
 * All intelligence is in the mapping configuration
 */

/**
 * Extract value from source using a simple path
 * Supports:
 * - $.eventPayload.message
 * - $.previousResults[0].result.summary
 * - $.previousResults.Process User Message.result.intent
 */
function extractValue(source: any, path: string): any {
  if (!path || path === '$') return source;
  
  // Remove leading $ if present
  const cleanPath = path.startsWith('$.') ? path.substring(2) : path;
  
  // Split on dots but preserve array indices and quoted strings
  const segments = cleanPath.match(/([^.\[\]]+|\[[^\]]+\])/g) || [];
  
  let current = source;
  for (const segment of segments) {
    if (current === null || current === undefined) return undefined;
    
    // Handle array index like [0]
    if (segment.startsWith('[') && segment.endsWith(']')) {
      const index = segment.slice(1, -1);
      current = current[index];
    }
    // Handle previousResults by label
    else if (current === source.previousResults && !(/^\d+$/.test(segment))) {
      // Find by step label
      const result = current.find((r: any) => r.stepLabel === segment);
      current = result;
    }
    else {
      current = current[segment];
    }
  }
  
  return current;
}

/**
 * Apply field mappings to create template parameters
 * This is the core "dumb" logic - it just follows the mappings
 */
export function applyFieldMappings(
  mappings: FieldMapping[],
  context: ExecutionContext
): Record<string, any> {
  const result: Record<string, any> = {};
  
  // Debug log the available context
  logger.debug('Applying field mappings with context:', {
    eventType: context.eventType,
    eventPayloadKeys: context.eventPayload ? Object.keys(context.eventPayload) : [],
    eventPayloadSample: context.eventPayload,
    previousResultsCount: context.previousResults.length,
    mappingsCount: mappings.length
  });
  
  for (const mapping of mappings) {
    try {
      // Extract value from source
      let value = extractValue(context, mapping.sourcePath);
      
      // Use default if undefined
      if (value === undefined && mapping.defaultValue !== undefined) {
        value = mapping.defaultValue;
      }
      
      // Apply transform if specified
      if (mapping.transform && value !== undefined) {
        value = applyTransform(value, mapping.transform);
      }
      
      // Set the target field
      result[mapping.targetField] = value;
      
      logger.debug(`Mapped ${mapping.sourcePath} -> ${mapping.targetField}:`, value);
    } catch (error) {
      logger.error(`Failed to apply mapping for ${mapping.targetField}:`, { error, mapping });
      if (mapping.defaultValue !== undefined) {
        result[mapping.targetField] = mapping.defaultValue;
      }
    }
  }
  
  return result;
}

/**
 * Simple transform functions
 */
function applyTransform(value: any, transform: string): any {
  switch (transform) {
    case 'toString':
      return String(value);
    case 'toNumber':
      return Number(value);
    case 'toBoolean':
      return Boolean(value);
    case 'toJSON':
      return JSON.stringify(value);
    case 'fromJSON':
      return typeof value === 'string' ? JSON.parse(value) : value;
    case 'toUpperCase':
      return String(value).toUpperCase();
    case 'toLowerCase':
      return String(value).toLowerCase();
    default:
      logger.warn(`Unknown transform: ${transform}`);
      return value;
  }
} 