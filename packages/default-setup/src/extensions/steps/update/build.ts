import type { StepDefinition, StepCompileResult, StepValidationError, StepValidationContext, StepCompileContext, StepDecompileContext } from '@abuddy/sdk/steps';
import { EARS } from '@abuddy/sdk';
import { expandRecord, collapseRecord } from '@abuddy/sdk/steps';
import { validateFields } from '../create/build';

function compile(node: Record<string, unknown>, nodeId: string, ts: number, _ctx: StepCompileContext): StepCompileResult {
  return {
    entity: {
      id: nodeId,
      entityType: EARS.Entity.Node,
      createdAt: ts,
      nodeType: 'update',
      label: (node.label as string) || 'Update',
      description: node.description,
      target: node.target,
      params: node.params,
      fieldMappings: expandRecord(node.map as Record<string, string> | undefined),
      onMissing: node.onMissing,
      entityTypeTarget: node.entity,
      final: node.final,
    },
    relations: [],
  };
}

function validate(s: Record<string, unknown>, path: string, _ctx: StepValidationContext): StepValidationError[] {
  const errors: StepValidationError[] = [];
  if (!s.target || typeof s.target !== 'string') {
    errors.push({ path, message: 'Update step must have a "target" string (an entity id, or a $. path to one)' });
  }
  if (s.onMissing !== undefined && !['fail', 'ignore', 'create'].includes(s.onMissing as string)) {
    errors.push({ path: `${path}.onMissing`, message: '"onMissing" must be "fail", "ignore", or "create"' });
  }
  if (s.entity !== undefined && (typeof s.entity !== 'string' || !s.entity)) {
    errors.push({ path: `${path}.entity`, message: '"entity" must be an entity type string' });
  } else if (s.onMissing === 'create' && !s.entity) {
    errors.push({ path: `${path}.entity`, message: '"onMissing: \'create\'" needs "entity", the entity type to create' });
  }
  return [...errors, ...validateFields(s, path)];
}

function getLabel(step: Record<string, unknown>, index: number): string {
  if (typeof step.label === 'string') return step.label;
  return `Update ${index}`;
}

function decompile(node: Record<string, unknown>, _ctx: StepDecompileContext): Record<string, unknown> {
  const dsl: Record<string, unknown> = { type: 'update', target: node.target };
  if (node.label) dsl.label = node.label;
  if (node.description) dsl.description = node.description;
  if (node.final) dsl.final = true;
  const map = collapseRecord(node.fieldMappings as Array<Record<string, string>> | undefined);
  if (map) dsl.map = map;
  if (node.params && Object.keys(node.params as object).length > 0) dsl.params = node.params;
  if (node.onMissing) dsl.onMissing = node.onMissing;
  if (node.entityTypeTarget) dsl.entity = node.entityTypeTarget;
  return dsl;
}

/** Build-time facets only (no runtime or FE imports); loaded by `abuddy build` in dependent packs. */
export const updateStepBuild: StepDefinition = {
  type: 'update',
  build: { compile, validate, getLabel, decompile },
};
