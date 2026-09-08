import type { StepCompileResult, StepCompileContext, StepValidationError, StepValidationContext, StepDecompileContext } from '@abuddy/sdk/steps';
import { EARS } from '@abuddy/sdk';
import { expandRecord, collapseRecord } from '@abuddy/sdk/steps';

export function compile(
  node: Record<string, unknown>,
  nodeId: string,
  ts: number,
  ctx: StepCompileContext,
): StepCompileResult {
  const actionId = ctx.actions.get(node.action as string);
  return {
    entity: {
      id: nodeId,
      entityType: EARS.Entity.Node,
      createdAt: ts,
      nodeType: 'action',
      label: (node.label as string) || (node.action as string),
      description: node.description,
      actionId,
      params: node.params,
      fieldMappings: expandRecord(node.map as Record<string, string> | undefined),
      final: node.final,
    },
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
  if (!s.action || typeof s.action !== 'string') {
    errors.push({ path, message: 'Action step must have an "action" string (action name)' });
  } else if (!ctx.skipReferenceCheck && !ctx.actions.has(s.action)) {
    errors.push({
      path: `${path}.action`,
      message: `Action "${s.action}" not found. Available: ${Array.from(ctx.actions).join(', ') || '(none)'}`,
    });
  }
  if (s.map !== undefined && (typeof s.map !== 'object' || s.map === null || Array.isArray(s.map))) {
    errors.push({ path: `${path}.map`, message: '"map" must be an object { target: source }' });
  }
  return errors;
}

export function getLabel(step: Record<string, unknown>, index: number): string {
  if (typeof step.label === 'string') return step.label;
  return (step.action as string) || `Action ${index}`;
}

export function decompile(node: Record<string, unknown>, ctx: StepDecompileContext): Record<string, unknown> {
  const actionLabel = node.actionId
    ? ctx.actionMap.get(node.actionId as string) || node.actionId
    : node.label || 'Unknown Action';
  const dsl: Record<string, unknown> = { type: 'action', action: actionLabel };
  if (node.label && node.label !== actionLabel) dsl.label = node.label;
  if (node.description) dsl.description = node.description;
  if (node.final) dsl.final = true;
  const map = collapseRecord(node.fieldMappings as any);
  if (map) dsl.map = map;
  if (node.params && Object.keys(node.params as any).length > 0) dsl.params = node.params;
  return dsl;
}
