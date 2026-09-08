import type { StepDefinition, StepCompileResult, StepValidationError, StepValidationContext, StepCompileContext, StepDecompileContext } from '@abuddy/sdk/steps';
import { EARS } from '@abuddy/sdk';
import { keepAliveStepFE } from './fe';

function compile(node: Record<string, unknown>, nodeId: string, ts: number, _ctx: StepCompileContext): StepCompileResult {
  return {
    entity: {
      id: nodeId,
      entityType: EARS.Entity.Node,
      createdAt: ts,
      nodeType: 'keep_alive',
      label: (node.label as string) || 'Keep Alive',
      description: node.description,
      final: node.final,
    },
    relations: [],
  };
}

function validate(_s: Record<string, unknown>, _path: string, _ctx: StepValidationContext): StepValidationError[] {
  return [];
}

function getLabel(step: Record<string, unknown>, index: number): string {
  if (typeof step.label === 'string') return step.label;
  return `Keep Alive ${index}`;
}

function decompile(node: Record<string, unknown>, _ctx: StepDecompileContext): Record<string, unknown> {
  const dsl: Record<string, unknown> = { type: 'keep_alive' };
  if (node.label) dsl.label = node.label;
  if (node.description) dsl.description = node.description;
  if (node.final) dsl.final = true;
  return dsl;
}

export const keepAliveStep: StepDefinition = {
  type: 'keep_alive',
  build: { compile, validate, getLabel, decompile },
  runtime: {
    handler() {},
  },
  fe: keepAliveStepFE.fe,
};
