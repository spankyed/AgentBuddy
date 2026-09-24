import type { StepDefinition, StepCompileResult, StepValidationError, StepValidationContext, StepCompileContext, StepDecompileContext } from '@abuddy/sdk/steps';
import { EARS } from '@abuddy/sdk';
import { isModelId } from '@abuddy/sdk/models';

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
      model: node.model,
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
  // The result holds the generated query under `query`
  if (s.as !== undefined && (typeof s.as !== 'string' || !s.as || s.as === 'query')) {
    errors.push({ path: `${path}.as`, message: `"as" must be a non-empty string other than "query", got ${JSON.stringify(s.as)}` });
  }
  if (s.model !== undefined && (typeof s.model !== 'string' || !isModelId(s.model))) {
    errors.push({ path: `${path}.model`, message: `"model" must be a provider:model id (e.g. "anthropic:claude-opus-5"), got ${JSON.stringify(s.model)}` });
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
  if (node.model) dsl.model = node.model;
  return dsl;
}

/** Build-time facets only (no runtime or FE imports); loaded by `abuddy build` in dependent packs. */
export const queryStepBuild: StepDefinition = {
  type: 'query',
  build: { compile, validate, getLabel, decompile },
};
