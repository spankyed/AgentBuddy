import type { NodeEntity, NodeKind } from '@/systems/flows/config/types';
import type { ExecutionContext, FieldMapping } from '@/systems/brain/types';
import { createLogger } from '@/core/utils/debug/logger';

const logger = createLogger('node-attribute-mappers');

/*─────────────────────────────────────────────────────────────────
 * Field Mapping Utilities
 *─────────────────────────────────────────────────────────────────*/

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
function mapTemplateFields(
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

/*─────────────────────────────────────────────────────────────────
 * Node Attribute Mapper Interface
 * Each mapper handles attribute extraction and field mapping for a specific node type
 *─────────────────────────────────────────────────────────────────*/
interface NodeAttributeMapper<T extends NodeEntity = NodeEntity> {
  // Extract node-specific attributes (excluding common fields)
  extractAttributes(node: T): Record<string, any>;
  
  // Apply field mappings if the node type supports them
  applyFieldMappings(node: T, context: ExecutionContext): Record<string, any> | undefined;
}

/*─────────────────────────────────────────────────────────────────
 * Base mapper for common functionality
 *─────────────────────────────────────────────────────────────────*/
const COMMON_FIELDS_TO_EXCLUDE = [
  'id', 'entityType', 'nodeType', 'label', 'description', 'final', 'createdAt', 'updatedAt'
] as const;

function extractBaseAttributes(node: NodeEntity): Record<string, any> {
  const attributes: Record<string, any> = {};
  
  Object.entries(node).forEach(([key, value]) => {
    if (!COMMON_FIELDS_TO_EXCLUDE.includes(key as any)) {
      attributes[key] = value;
    }
  });
  
  return attributes;
}

/*─────────────────────────────────────────────────────────────────
 * Default mapper for nodes without special handling
 *─────────────────────────────────────────────────────────────────*/
const defaultMapper: NodeAttributeMapper = {
  extractAttributes(node) {
    return extractBaseAttributes(node);
  },
  
  applyFieldMappings() {
    return undefined; // No field mappings for default nodes
  }
};

/*─────────────────────────────────────────────────────────────────
 * Types for nodes with field mappings
 *─────────────────────────────────────────────────────────────────*/
type NodeWithFieldMappings = NodeEntity & {
  fieldMappings?: FieldMapping[] | FieldMapping;
};

/*─────────────────────────────────────────────────────────────────
 * Factory for creating mappers that support field mappings
 *─────────────────────────────────────────────────────────────────*/
function createFieldMappingMapper(nodeTypeName: string, excludeFields: string[]): NodeAttributeMapper {
  return {
    extractAttributes(node: NodeWithFieldMappings) {
      const attributes: Record<string, any> = {};
      const fieldsToExclude = ['fieldMappings', ...excludeFields];
      
      Object.entries(node).forEach(([key, value]) => {
        if (!fieldsToExclude.includes(key)) {
          attributes[key] = value;
        }
      });
      
      return attributes;
    },
    
    applyFieldMappings(node: NodeWithFieldMappings, context: ExecutionContext) {
      if (node.fieldMappings) {
        // Normalize fieldMappings to always be an array
        const mappings = Array.isArray(node.fieldMappings) 
          ? node.fieldMappings 
          : [node.fieldMappings];
        
        if (mappings.length > 0) {
          logger.debug(`Applying field mappings for ${nodeTypeName} node: ${node.label}`, {
            mappingsCount: mappings.length,
            isArray: Array.isArray(node.fieldMappings)
          });
          return mapTemplateFields(mappings, context);
        }
      }
      return undefined;
    }
  };
}

/*─────────────────────────────────────────────────────────────────
 * Create mappers for nodes with field mappings
 *─────────────────────────────────────────────────────────────────*/
const llmNodeMapper = createFieldMappingMapper('LLM', COMMON_FIELDS_TO_EXCLUDE as unknown as string[]);
const actionNodeMapper = createFieldMappingMapper('Action', COMMON_FIELDS_TO_EXCLUDE as unknown as string[]);
const flowNodeMapper = createFieldMappingMapper('Flow', COMMON_FIELDS_TO_EXCLUDE as unknown as string[]);

/*─────────────────────────────────────────────────────────────────
 * Mapper Registry
 *─────────────────────────────────────────────────────────────────*/
const nodeAttributeMappers: Record<NodeKind, NodeAttributeMapper> = {
  llm: llmNodeMapper,
  action: actionNodeMapper,
  flow: flowNodeMapper,
  // All other node types use default mapper
  query: defaultMapper,
  create: defaultMapper,
  update: defaultMapper,
  decision: defaultMapper,
  fire: defaultMapper,
  listen: defaultMapper,
  transform: defaultMapper,
  keep_alive: defaultMapper,
};

/*─────────────────────────────────────────────────────────────────
 * Public API
 *─────────────────────────────────────────────────────────────────*/
function getMapper(nodeType: NodeKind): NodeAttributeMapper {
  return nodeAttributeMappers[nodeType] || defaultMapper;
}

/**
 * Prepare all attributes for a node to be stored on the TNode entity
 * This creates a complete instantiation of the node with all values resolved
 */
export function prepareNodeAttributes(
  node: NodeEntity,
  executionContext: ExecutionContext
): Record<string, any> {
  const mapper = getMapper(node.nodeType);
  
  // Extract base attributes (excludes common fields and fieldMappings)
  const baseAttributes = mapper.extractAttributes(node);
  
  // Apply field mappings if supported by this node type
  const mappedParams = mapper.applyFieldMappings(node, executionContext);
  
  // Merge base attributes with resolved mapped values
  const resolvedAttributes = {
    ...baseAttributes,
    ...(mappedParams && mappedParams)
  };
  
  logger.debug(`Prepared TNode attributes for ${node.nodeType} node: ${node.label}`, {
    baseAttributeKeys: Object.keys(baseAttributes),
    mappedParamKeys: mappedParams ? Object.keys(mappedParams) : [],
    finalAttributeKeys: Object.keys(resolvedAttributes),
  });
  
  return resolvedAttributes;
}