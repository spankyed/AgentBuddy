import type { StepBuildFacet, StepNodeFacet } from '@abuddy/sdk/steps';
import type { StepCompileResult, StepCompileContext, StepValidationError, StepValidationContext, StepDecompileContext } from '@abuddy/sdk/steps';
import { EARS } from '@abuddy/sdk';
import { expandRecord, collapseRecord, mapProblems } from '@abuddy/sdk/steps';
import type { FieldMapping, MapEntry } from '@abuddy/sdk/steps';

export function compile(
  node: Record<string, unknown>,
  nodeId: string,
  ts: number,
  ctx: StepCompileContext,
): StepCompileResult {
  const code = node.mode === 'code';
  const actionId = code ? undefined : ctx.actions.get(node.action as string);
  return {
    entity: {
      id: nodeId,
      entityType: EARS.Entity.Node,
      createdAt: ts,
      nodeType: 'action',
      label: (node.label as string) || (node.action as string) || 'Action',
      description: node.description,
      mode: code ? 'code' : undefined,
      actionFn: code ? node.actionFn : undefined,
      actionId,
      params: node.params,
      fieldMappings: expandRecord(node.map as Record<string, MapEntry> | undefined),
      final: node.final,
    },
    // Code mode has no Action to be an instance of
    relations: actionId ? [
      { source: nodeId, kind: EARS.RelKind.INSTANCE_OF as string, target: actionId }
    ] : [],
  };
}

export function validate(
  s: Record<string, unknown>,
  path: string,
  ctx: StepValidationContext,
): StepValidationError[] {
  const errors: StepValidationError[] = [];
  if (s.mode === 'code') {
    // The union in types.ts refuses these at the call site; this is for DSL that arrived as data
    if (!s.actionFn || typeof s.actionFn !== 'string') {
      errors.push({ path, message: 'An action step in code mode must have an "actionFn" string' });
    }
    if (s.action !== undefined) {
      errors.push({ path, message: 'An action step in code mode names no action: drop "action" or drop "mode"' });
    }
    return errors;
  }
  if (s.actionFn !== undefined) {
    errors.push({ path, message: 'An action step with "actionFn" must set mode: "code"' });
  }
  if (!s.action || typeof s.action !== 'string') {
    errors.push({ path, message: 'Action step must have an "action" string (action name)' });
  } else if (!ctx.skipReferenceCheck && !ctx.actions.has(s.action)) {
    errors.push({
      path: `${path}.action`,
      message: `Action "${s.action}" not found. Available: ${Array.from(ctx.actions).join(', ') || '(none)'}`,
    });
  }
  return [...errors, ...mapProblems(s.map, `${path}.map`)];
}

export function getLabel(step: Record<string, unknown>, index: number): string {
  if (typeof step.label === 'string') return step.label;
  return (step.action as string) || `Action ${index}`;
}

export function decompile(node: Record<string, unknown>, ctx: StepDecompileContext): Record<string, unknown> {
  const code = node.mode === 'code';
  const actionLabel = node.actionId
    ? ctx.actionMap.get(node.actionId as string) || node.actionId
    : node.label || 'Unknown Action';
  // A code-mode node names no action, and inventing one from its label is how an export used to both lose the
  // code and fail its own re-import with `Action "<label>" not found`
  const dsl: Record<string, unknown> = code
    ? { type: 'action', mode: 'code', actionFn: node.actionFn }
    : { type: 'action', action: actionLabel };
  if (node.label && (code || node.label !== actionLabel)) dsl.label = node.label;
  if (node.description) dsl.description = node.description;
  if (node.final) dsl.final = true;
  const map = collapseRecord(node.fieldMappings as FieldMapping[] | undefined);
  if (map) dsl.map = map;
  if (node.params && Object.keys(node.params as any).length > 0) dsl.params = node.params;
  return dsl;
}

/** Build-time facets only (no runtime or FE imports); loaded by `abuddy build` in dependent packs. */
export const actionStepBuild: StepBuildFacet = { compile, validate, getLabel, decompile, relation: { field: 'actionId', targetEntity: 'Action' } };

/** What a node of this type starts with; the backend writes it and the canvas draws it */
export const actionStepNode: StepNodeFacet = {
  label: 'Action',
  defaultLabel: 'Do action',
};
