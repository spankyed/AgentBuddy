import type { StepDefinition, StepCompileResult, StepValidationError, StepValidationContext, StepCompileContext, StepDecompileContext } from '@abuddy/sdk/steps';
import { EARS } from '@abuddy/sdk';
import { expandRecord, collapseRecord } from '@abuddy/sdk/steps';
import { isPlainObject } from '@abuddy/sdk/utils/pure';

function compile(node: Record<string, unknown>, nodeId: string, ts: number, _ctx: StepCompileContext): StepCompileResult {
  return {
    entity: {
      id: nodeId,
      entityType: EARS.Entity.Node,
      createdAt: ts,
      nodeType: 'create',
      label: (node.label as string) || `Create ${node.entity}`,
      description: node.description,
      entityTypeTarget: node.entity as EARS.Entity,
      params: node.params,
      fieldMappings: expandRecord(node.map as Record<string, string> | undefined),
      inferLabel: node.inferLabel,
      final: node.final,
    },
    relations: [],
  };
}

/** Errors for a step's `map` and `params` fields, shared with the update step */
export function validateFields(s: Record<string, unknown>, path: string): StepValidationError[] {
  const errors: StepValidationError[] = [];
  if (s.map !== undefined && !isPlainObject(s.map)) {
    errors.push({ path: `${path}.map`, message: '"map" must be an object { field: source }' });
  }
  if (s.params !== undefined && !isPlainObject(s.params)) {
    errors.push({ path: `${path}.params`, message: '"params" must be an object { field: value }' });
  }
  return errors;
}

function validate(s: Record<string, unknown>, path: string, _ctx: StepValidationContext): StepValidationError[] {
  const errors: StepValidationError[] = [];
  if (!s.entity || typeof s.entity !== 'string') {
    errors.push({ path, message: 'Create step must have an "entity" string (entity type)' });
  }
  if (s.inferLabel !== undefined && typeof s.inferLabel !== 'boolean') {
    errors.push({ path: `${path}.inferLabel`, message: '"inferLabel" must be a boolean' });
  }
  return [...errors, ...validateFields(s, path)];
}

function getLabel(step: Record<string, unknown>, index: number): string {
  if (typeof step.label === 'string') return step.label;
  return `Create ${step.entity || index}`;
}

function decompile(node: Record<string, unknown>, _ctx: StepDecompileContext): Record<string, unknown> {
  const dsl: Record<string, unknown> = { type: 'create', entity: node.entityTypeTarget };
  if (node.label) dsl.label = node.label;
  if (node.description) dsl.description = node.description;
  if (node.final) dsl.final = true;
  const map = collapseRecord(node.fieldMappings as Array<Record<string, string>> | undefined);
  if (map) dsl.map = map;
  if (node.params && Object.keys(node.params as object).length > 0) dsl.params = node.params;
  if (typeof node.inferLabel === 'boolean') dsl.inferLabel = node.inferLabel;
  return dsl;
}

/** Build-time facets only (no runtime or FE imports); loaded by `abuddy build` in dependent packs. */
export const createStepBuild: StepDefinition = {
  type: 'create',
  build: { compile, validate, getLabel, decompile },
};
