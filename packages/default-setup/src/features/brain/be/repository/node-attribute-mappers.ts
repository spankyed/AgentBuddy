import type { NodeEntity } from '@/core/shared-types/flows';
import type { ExecutionContext, FieldMapping, SourceResolver } from '@/systems/brain/types';
import { brainInspect, brainLogger } from '../utils/brain-inspect';
import { truncateResult, isTruncated } from '../utils/result-truncator';

/*─────────────────────────────────────────────────────────────
 * Field Mapping Utilities
 *─────────────────────────────────────────────────────────────*/

function extractValue(
  context: ExecutionContext,
  source: SourceResolver
): any {
  if (typeof source === 'function') {
    try {
      return source(context);
    } catch (error) {
      brainLogger.error('Function extractor failed:', { error });
      return undefined;
    }
  }

  if (typeof source === 'string') {
    if (source.startsWith('$.')) {
      return extractValueByPath(context, source);
    }
    try {
      return JSON.parse(source);
    } catch {
      return source; // literal string
    }
  }

  return source;
}

export function extractValueByPath(source: any, path: string): any {
  if (!path || path === '$') return source;
  const cleanPath = path.startsWith('$.') ? path.slice(2) : path;
  const segments = cleanPath.split('.');

  let current = source;
  for (const segment of segments) {
    if (current == null) return undefined;

    // steps[id=TNode-123] / steps[label=Process User Message]
    const selector = segment.match(/^(\w+)\[(\w+)=([^\]]+)\]$/);
    if (selector) {
      const [, arrayName, field, value] = selector;
      const arr = current[arrayName];
      if (!Array.isArray(arr)) return undefined;
      current = arr.find((item: any) => item?.[field] === value);
    } else {
      current = current[segment];
    }
  }
  return current;
}

function mapTemplateFields(
  mappings: FieldMapping[],
  context: ExecutionContext
): Record<string, any> {
  const result: Record<string, any> = {};

  brainInspect('Applying field mappings:', {
    eventType: context.event.type,
    eventDataKeys: Object.keys(context.event.data),
    eventData: context.event.data,
    stepsCount: context.steps.length,
    lastStepLabel: context.lastStep?.label,
    mappingsCount: mappings.length
  });

  for (const mapping of mappings) {
    try {
      let value = extractValue(context, mapping.source);
      if (value === undefined && mapping.default !== undefined) value = mapping.default;

      result[mapping.target] = value;

      brainInspect(`Mapped ${mapping.target}:`, {
        source: typeof mapping.source === 'function' ? '[Function]' : mapping.source,
        value
      });
    } catch (error) {
      brainLogger.error(`Failed to apply mapping for ${mapping.target}:`, { error, mapping });
      if (mapping.default !== undefined) result[mapping.target] = mapping.default;
    }
  }

  return result;
}

/*─────────────────────────────────────────────────────────────
 * Unified Mapper (simplifies the registry/factory)
 *─────────────────────────────────────────────────────────────*/
const COMMON_ATTRIBUTES_TO_EXCLUDE = new Set([
  // Internal/system fields only
  'id',
  'entityType',
  'nodeType',
  'label',
  'description',
  'final',
  'createdAt',
  'updatedAt',
  'fieldMappings'
  
  // Note: Configuration fields like actionId, model, eventType etc. 
  // are now INCLUDED in nodeAttributes so they can be displayed in UI
]);

function extractAttributes(node: NodeEntity): Record<string, any> {
  const attributes: Record<string, any> = {};

  for (const [key, value] of Object.entries(node)) {
    if (COMMON_ATTRIBUTES_TO_EXCLUDE.has(key)) continue;
    attributes[key] = value;
  }

  return attributes;
}

// Node types that support fieldMappings
// const MAPPING_NODE_TYPES = new Set<NodeKind>(['llm', 'action', 'flow']);

function applyFieldMappingsIfSupported(
  node: NodeEntity & { fieldMappings?: FieldMapping[] | FieldMapping },
  context: ExecutionContext
): Record<string, any> | undefined {
  // if (!MAPPING_NODE_TYPES.has(node.nodeType)) return undefined;

  const fm = node.fieldMappings;
  if (!fm) return undefined;

  const mappings = Array.isArray(fm) ? fm : [fm];
  if (mappings.length === 0) return undefined;

  brainInspect(`Applying field mappings for ${node.nodeType} node: ${node.label}`, {
    mappingsCount: mappings.length,
    isArray: Array.isArray(fm)
  });

  return mapTemplateFields(mappings, context);
}

/*─────────────────────────────────────────────────────────────
 * Truncation helper
 *─────────────────────────────────────────────────────────────*/

function truncateAll(obj: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    const truncated = truncateResult(value);
    // Unwrap truncated strings so downstream consumers (actions) receive
    // a plain string instead of a { value, _truncated, ... } wrapper.
    out[key] = (isTruncated(truncated) && truncated._type === 'string')
      ? truncated.value
      : truncated;
  }
  return out;
}

/*─────────────────────────────────────────────────────────────
 * Public API
 *─────────────────────────────────────────────────────────────*/

export interface PreparedAttributes {
  /** All attributes (config + user data) for UI display. */
  nodeAttributes: Record<string, any>;
  /** Only user-provided params (direct + mapped) for action/template execution. */
  resolvedParams: Record<string, any>;
}

export function prepareNodeAttributes(
  node: NodeEntity,
  executionContext: ExecutionContext
): PreparedAttributes {
  const baseAttributes = extractAttributes(node);
  const mappedParams = applyFieldMappingsIfSupported(node as any, executionContext);

  // nodeAttributes: everything merged (for UI display)
  const resolvedAttributes = {
    ...baseAttributes,
    ...(mappedParams && mappedParams)
  };

  // resolvedParams: only user-provided data (for execution)
  // Sources: 1) direct params from DSL  2) resolved field mappings
  const resolvedParams: Record<string, any> = {
    ...((node as any).params || {}),
    ...(mappedParams || {}),
  };

  return {
    nodeAttributes: truncateAll(resolvedAttributes),
    resolvedParams: truncateAll(resolvedParams),
  };
}
