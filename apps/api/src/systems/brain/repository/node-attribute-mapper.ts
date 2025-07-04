import type { NodeEntity, LLMNode, ActionNode } from '@/systems/flows/types';
import type { ExecutionContext } from '@/systems/brain/types';
import { applyFieldMappings } from '@/systems/brain/runner/field-mapper';
import { createLogger } from '@/systems/logs/logger';

const logger = createLogger('node-attribute-mapper');

/**
 * Extract relevant attributes from a NodeEntity based on its type
 * This function extracts all node-specific configuration
 * but excludes fieldMappings since those will be resolved into actual values
 */
function extractNodeAttributes(node: NodeEntity): Record<string, any> {
  // Common attributes that should be excluded (already on TNodeEntity)
  const { id, entityType, nodeType, label, description, color, final, createdAt, ...nodeSpecific } = node;
  
  // Also exclude fieldMappings from LLM and Action nodes since we'll resolve those
  if ('fieldMappings' in nodeSpecific) {
    const { fieldMappings, ...rest } = nodeSpecific;
    return rest;
  }
  
  return nodeSpecific;
}

/**
 * Apply field mappings for nodes that support them (LLM and Action nodes)
 * Returns the mapped parameters that should be stored on the TNode
 */
function applyNodeFieldMappings(
  node: NodeEntity,
  executionContext: ExecutionContext
): Record<string, any> | undefined {
  switch (node.nodeType) {
    case 'llm': {
      const llmNode = node as LLMNode;
      if (llmNode.fieldMappings && llmNode.fieldMappings.length > 0) {
        logger.debug(`Applying field mappings for LLM node: ${node.label}`);
        return applyFieldMappings(llmNode.fieldMappings, executionContext);
      }
      break;
    }
    
    case 'action': {
      const actionNode = node as ActionNode;
      if (actionNode.fieldMappings && actionNode.fieldMappings.length > 0) {
        logger.debug(`Applying field mappings for Action node: ${node.label}`);
        return applyFieldMappings(actionNode.fieldMappings, executionContext);
      }
      break;
    }
  }
  
  return undefined;
}

/**
 * Prepare all attributes for a node to be stored on the TNode entity
 * This creates a complete instantiation of the node with all values resolved
 */
export function prepareNodeAttributes(
  node: NodeEntity,
  executionContext: ExecutionContext
): Record<string, any> {
  // Start with base node attributes (excludes fieldMappings)
  const baseAttributes = extractNodeAttributes(node);
  
  // For nodes with field mappings, apply them and merge the resolved values
  const mappedParams = applyNodeFieldMappings(node, executionContext);
  
  // Create the final TNode attributes by merging base attributes with mapped values
  // For LLM nodes: this means actual prompt params will be available
  // For Action nodes: this means actual action params will be available
  const resolvedAttributes = {
    ...baseAttributes,
    ...(mappedParams && mappedParams)
  };
  
  logger.debug(`Prepared TNode attributes for ${node.nodeType} node: ${node.label}`, {
    baseAttributeKeys: Object.keys(baseAttributes),
    mappedParamKeys: mappedParams ? Object.keys(mappedParams) : [],
    finalAttributeKeys: Object.keys(resolvedAttributes),
    resolvedAttributes
  });
  
  return resolvedAttributes;
}