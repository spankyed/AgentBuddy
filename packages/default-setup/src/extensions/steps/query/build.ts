import type { StepDefinition, StepCompileResult, StepValidationError, StepValidationContext, StepCompileContext, StepDecompileContext } from '@abuddy/sdk/steps';
import { EARS } from '@abuddy/sdk';

function compile(node: Record<string, unknown>, nodeId: string, ts: number, _ctx: StepCompileContext): StepCompileResult {
  return {
    entity: {
      id: nodeId,
      entityType: EARS.Entity.Node,
      createdAt: ts,
      nodeType: 'query',
      label: (node.label as string) || 'Query',
      description: node.description,
      prompt: node.prompt,
      resultKey: node.as,
      final: node.final,
    },
    relations: [],
  };
}

function validate(s: Record<string, unknown>, path: string, _ctx: StepValidationContext): StepValidationError[] {
  const errors: StepValidationError[] = [];
  if (!s.prompt || typeof s.prompt !== 'string') {
    errors.push({ path, message: 'Query step must have a "prompt" string' });
  }
  return errors;
}

function getLabel(step: Record<string, unknown>, index: number): string {
  if (typeof step.label === 'string') return step.label;
  return `Query ${index}`;
}

function decompile(node: Record<string, unknown>, _ctx: StepDecompileContext): Record<string, unknown> {
  const dsl: Record<string, unknown> = { type: 'query', prompt: node.prompt };
  if (node.label) dsl.label = node.label;
  if (node.description) dsl.description = node.description;
  if (node.final) dsl.final = true;
  if (node.resultKey) dsl.as = node.resultKey;
  return dsl;
}

/** Build-time facets only (no runtime or FE imports); loaded by `abuddy build` in dependent packs. */
export const queryStepBuild: StepDefinition = {
  type: 'query',
  build: { compile, validate, getLabel, decompile },
};
