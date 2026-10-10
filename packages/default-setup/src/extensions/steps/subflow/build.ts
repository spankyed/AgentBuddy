import type { StepBuildFacet, StepCompileResult, StepCompileContext, StepValidationError, StepValidationContext, StepDecompileContext } from '@abuddy/sdk/steps';
import { EARS } from '@abuddy/sdk';
import { expandRecord, collapseRecord, mapProblems } from '@abuddy/sdk/steps';
import type { FieldMapping, MapEntry } from '@abuddy/sdk/steps';

function compile(
  node: Record<string, unknown>,
  nodeId: string,
  ts: number,
  ctx: StepCompileContext,
): StepCompileResult {
  const flowRef = ctx.flows.get(node.flow as string) || (node.flow as string);
  return {
    entity: {
      id: nodeId,
      entityType: EARS.Entity.Node,
      createdAt: ts,
      nodeType: 'subflow',
      label: (node.label as string) || (node.flow as string),
      description: node.description,
      flowRef,
      propagateCtx: node.inherit !== false,
      fieldMappings: expandRecord(node.map as Record<string, MapEntry> | undefined),
      final: node.final,
    },
    relations: [],
  };
}

function validate(
  s: Record<string, unknown>,
  path: string,
  ctx: StepValidationContext,
): StepValidationError[] {
  const errors: StepValidationError[] = [];
  if (!s.flow || typeof s.flow !== 'string') {
    errors.push({ path, message: 'Flow step must have a "flow" string (sub-flow name)' });
  } else if (!ctx.skipReferenceCheck && !ctx.flowNames.has(s.flow)) {
    // `compile` falls back to the name itself when it resolves to no flow, so without this a typo becomes a
    // node whose flowRef points at nothing and says so only at runtime, if anyone is watching
    errors.push({
      path: `${path}.flow`,
      message: `Flow "${s.flow}" not found. Available: ${Array.from(ctx.flowNames).join(', ') || '(none)'}`,
    });
  }
  return [...errors, ...mapProblems(s.map, `${path}.map`)];
}

function getLabel(step: Record<string, unknown>, index: number): string {
  if (typeof step.label === 'string') return step.label;
  return (step.flow as string) || `Flow ${index}`;
}

function decompile(node: Record<string, unknown>, ctx: StepDecompileContext): Record<string, unknown> {
  const flowLabel = ctx.flowMap.get(node.flowRef as string) || node.flowRef;
  const dsl: Record<string, unknown> = { type: 'subflow', flow: flowLabel };
  if (node.label && node.label !== flowLabel) dsl.label = node.label;
  if (node.description) dsl.description = node.description;
  if (node.final) dsl.final = true;
  if (node.propagateCtx === false) dsl.inherit = false;
  const map = collapseRecord(node.fieldMappings as FieldMapping[] | undefined);
  if (map) dsl.map = map;
  return dsl;
}

/** Build-time facets only (no runtime or FE imports); loaded by `abuddy build` in dependent packs. */
export const flowStepBuild: StepBuildFacet = { compile, validate, getLabel, decompile };
