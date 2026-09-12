import type { StepDefinition, StepCompileResult, StepValidationError, StepValidationContext, StepCompileContext, StepDecompileContext, ExecutionContext, TNodeEntity } from '@abuddy/sdk/steps';
import { EARS } from '@abuddy/sdk';

function compile(node: Record<string, unknown>, nodeId: string, ts: number, _ctx: StepCompileContext): StepCompileResult {
  return {
    entity: {
      id: nodeId,
      entityType: EARS.Entity.Node,
      createdAt: ts,
      nodeType: 'kill',
      label: (node.label as string) || 'Kill Flow',
      description: node.description,
    },
    relations: [],
  };
}

function validate(_s: Record<string, unknown>, _path: string, _ctx: StepValidationContext): StepValidationError[] {
  return [];
}

function getLabel(step: Record<string, unknown>, index: number): string {
  if (typeof step.label === 'string') return step.label;
  return `Kill Flow ${index}`;
}


function decompile(node: Record<string, unknown>, _ctx: StepDecompileContext): Record<string, unknown> {
  const dsl: Record<string, unknown> = { type: 'kill' };
  if (node.label) dsl.label = node.label;
  if (node.description) dsl.description = node.description;
  return dsl;
}

/** Build-time facets only (no runtime or FE imports); loaded by `abuddy build` in dependent packs. */
export const killStepBuild: StepDefinition = {
  type: 'kill',
  build: { compile, validate, getLabel, decompile },
};
