import type { StepDefinition, StepCompileResult, StepValidationError, StepValidationContext, StepCompileContext, StepDecompileContext } from '@abuddy/sdk/steps';
import { EARS } from '@abuddy/sdk';
import { updateStepFE } from './fe';

function compile(node: Record<string, unknown>, nodeId: string, ts: number, _ctx: StepCompileContext): StepCompileResult {
  return {
    entity: {
      id: nodeId,
      entityType: EARS.Entity.Node,
      createdAt: ts,
      nodeType: 'update',
      label: (node.label as string) || 'Update',
      description: node.description,
      onMissing: node.onMissing,
      final: node.final,
    },
    relations: [],
  };
}

function validate(s: Record<string, unknown>, path: string, ctx: StepValidationContext): StepValidationError[] {
  const errors: StepValidationError[] = [];
  if (!s.target || typeof s.target !== 'string') {
    errors.push({ path, message: 'Update step must have a "target" string (label of create node)' });
  } else if (!ctx.nodeLabels.has(s.target as string)) {
    errors.push({
      path: `${path}.target`,
      message: `Referenced create node "${s.target}" not found in this flow`,
    });
  }
  if (s.onMissing !== undefined && !['fail', 'ignore', 'create'].includes(s.onMissing as string)) {
    errors.push({ path: `${path}.onMissing`, message: '"onMissing" must be "fail", "ignore", or "create"' });
  }
  return errors;
}

function getLabel(step: Record<string, unknown>, index: number): string {
  if (typeof step.label === 'string') return step.label;
  return `Update ${index}`;
}

function decompile(node: Record<string, unknown>, _ctx: StepDecompileContext): Record<string, unknown> {
  const dsl: Record<string, unknown> = { type: 'update', target: node.entityId };
  if (node.label) dsl.label = node.label;
  if (node.description) dsl.description = node.description;
  if (node.final) dsl.final = true;
  if (node.onMissing) dsl.onMissing = node.onMissing;
  return dsl;
}

export const updateStep: StepDefinition = {
  type: 'update',
  build: { compile, validate, getLabel, decompile },
  fe: updateStepFE.fe,
};
