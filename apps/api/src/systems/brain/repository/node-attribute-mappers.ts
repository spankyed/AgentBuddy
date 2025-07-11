import type { NodeEntity, NodeKind } from '@/systems/flows/config/types';
import type { ExecutionContext } from '@/systems/brain/types';
import { applyFieldMappings as applyFieldMappingsFn } from '@/systems/brain/runner/field-mapper';
import { createLogger } from '@/shared/debug/logger';

const logger = createLogger('node-attribute-mappers');

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
  fieldMappings?: Array<{
    target: string;
    source: string;
    default?: any;
  }>;
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
      if (node.fieldMappings && node.fieldMappings.length > 0) {
        logger.debug(`Applying field mappings for ${nodeTypeName} node: ${node.label}`);
        return applyFieldMappingsFn(node.fieldMappings, context);
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

/*─────────────────────────────────────────────────────────────────
 * Mapper Registry
 *─────────────────────────────────────────────────────────────────*/
const nodeAttributeMappers: Record<NodeKind, NodeAttributeMapper> = {
  llm: llmNodeMapper,
  action: actionNodeMapper,
  // All other node types use default mapper
  query: defaultMapper,
  create: defaultMapper,
  update: defaultMapper,
  decision: defaultMapper,
  fire: defaultMapper,
  listen: defaultMapper,
  transform: defaultMapper,
  flow: defaultMapper,
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