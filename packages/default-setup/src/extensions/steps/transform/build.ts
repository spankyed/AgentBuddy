import type { StepBuildFacet, StepCompileResult, StepValidationError, StepValidationContext, StepCompileContext, StepDecompileContext, StepNodeFacet } from '@abuddy/sdk/steps';
import { EARS } from '@abuddy/sdk';
import { expandRecord, collapseRecord, mapProblems } from '@abuddy/sdk/steps';
import type { FieldMapping, MapEntry } from '@abuddy/sdk/steps';

function compile(node: Record<string, unknown>, nodeId: string, ts: number, _ctx: StepCompileContext): StepCompileResult {
  return {
    entity: {
      id: nodeId,
      entityType: EARS.Entity.Node,
      createdAt: ts,
      nodeType: 'transform',
      label: (node.label as string) || 'Transform',
      description: node.description,
      script: node.script,
      outputType: (node.outputType as string) || 'json',
      fieldMappings: expandRecord(node.map as Record<string, MapEntry> | undefined),
      final: node.final,
    },
    relations: [],
  };
}

function validate(s: Record<string, unknown>, path: string, _ctx: StepValidationContext): StepValidationError[] {
  const errors: StepValidationError[] = [];
  if (!s.script || typeof s.script !== 'string') {
    errors.push({ path, message: 'Transform step must have a "script" string' });
  }
  if (s.outputType !== undefined && !['json', 'text', 'custom'].includes(s.outputType as string)) {
    errors.push({ path: `${path}.outputType`, message: '"outputType" must be "json", "text", or "custom"' });
  }
  return [...errors, ...mapProblems(s.map, `${path}.map`)];
}

function getLabel(step: Record<string, unknown>, index: number): string {
  if (typeof step.label === 'string') return step.label;
  return `Transform ${index}`;
}

function decompile(node: Record<string, unknown>, _ctx: StepDecompileContext): Record<string, unknown> {
  const dsl: Record<string, unknown> = { type: 'transform', script: node.script };
  if (node.label) dsl.label = node.label;
  if (node.description) dsl.description = node.description;
  if (node.final) dsl.final = true;
  if (node.outputType && node.outputType !== 'json') dsl.outputType = node.outputType;
  const map = collapseRecord(node.fieldMappings as FieldMapping[] | undefined);
  if (map) dsl.map = map;
  return dsl;
}

/** Build-time facets only (no runtime or FE imports); loaded by `abuddy build` in dependent packs. */
export const transformStepBuild: StepBuildFacet = { compile, validate, getLabel, decompile };

/** What a node of this type starts with; the backend writes it and the canvas draws it */
export const transformStepNode: StepNodeFacet = {
  label: 'Transform',
  defaultLabel: 'Transform output',
  defaults: { outputType: 'json' },
};
