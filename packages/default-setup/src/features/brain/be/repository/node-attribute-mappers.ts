import type { NodeEntity } from '#generated/types.ts';
import type { FieldMapping, SourceResolver } from '../types.ts';
import { brainLogger } from '../utils/brain-inspect.ts';
import type { ExecutionContext } from '@apackdev/sdk/steps';

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

    // steps[id=RunNode-123] / steps[label=Process User Message]
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

  brainLogger.debug('Applying field mappings:', {
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

      // A mapping that resolved to nothing writes nothing. `resolvedParams` is `{ ...params, ...mapped }`, and
      // an own property set to `undefined` overrides in a spread — so writing the target unconditionally erased
      // the literal the author had set beside the mapping. A mapping that should win even when its source is
      // missing says so with a `default`.
      if (value !== undefined) result[mapping.target] = value;

      brainLogger.debug(`Mapped ${mapping.target}:`, {
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
  
  // A step's own settings (actionId, model, eventType, ...) stay: they are what it runs on
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

  brainLogger.debug(`Applying field mappings for ${node.nodeType} node: ${node.label}`, {
    mappingsCount: mappings.length,
    isArray: Array.isArray(fm)
  });

  return mapTemplateFields(mappings, context);
}

/*─────────────────────────────────────────────────────────────
 * Public API
 *─────────────────────────────────────────────────────────────*/

/**
 * What a step runs on, whole: its settings with its field mappings applied (also what its run node records, which
 * the run history bounds), and the params it runs on (the node's own, and those mapped). Nothing here is truncated:
 * a step runs on its input as it is, and only the run history's copy is bounded.
 */
export function prepareStepInput(
  node: NodeEntity,
  executionContext: ExecutionContext
): { settings: Record<string, unknown>; params: Record<string, unknown> } {
  const mappedParams = applyFieldMappingsIfSupported(node as any, executionContext);
  return {
    settings: { ...extractAttributes(node), ...mappedParams },
    params: { ...(node as any).params, ...mappedParams },
  };
}
