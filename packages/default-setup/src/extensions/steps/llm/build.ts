import type { StepDefinition } from '@abuddy/sdk/steps';
import type { StepCompileResult, StepCompileContext, StepValidationError, StepValidationContext, StepDecompileContext } from '@abuddy/sdk/steps';
import { EARS } from '@abuddy/sdk';
import { expandRecord, collapseRecord } from '@abuddy/sdk/steps';

export function compile(
  node: Record<string, unknown>,
  nodeId: string,
  ts: number,
  ctx: StepCompileContext,
): StepCompileResult {
  const promptId = ctx.prompts.get(node.prompt as string);
  return {
    entity: {
      id: nodeId,
      entityType: EARS.Entity.Node,
      createdAt: ts,
      nodeType: 'llm',
      label: (node.label as string) || (node.prompt as string),
      description: node.description,
      promptTemplateId: promptId,
      fieldMappings: expandRecord(node.map as Record<string, string> | undefined),
      model: node.model,
      temperature: node.temperature,
      maxTokens: node.maxTokens,
      systemPrompt: node.systemPrompt,
      final: node.final,
    },
    relations: promptId ? [
      { source: nodeId, kind: EARS.RelKind.INSTANCE_OF as string, target: promptId }
    ] : [],
  };
}

export function validate(
  s: Record<string, unknown>,
  path: string,
  ctx: StepValidationContext,
): StepValidationError[] {
  const errors: StepValidationError[] = [];
  if (!s.prompt || typeof s.prompt !== 'string') {
    errors.push({ path, message: 'LLM step must have a "prompt" string (prompt template name)' });
  } else if (!ctx.skipReferenceCheck && !ctx.prompts.has(s.prompt)) {
    errors.push({
      path: `${path}.prompt`,
      message: `Prompt "${s.prompt}" not found. Available: ${Array.from(ctx.prompts).join(', ') || '(none)'}`,
    });
  }
  if (s.map !== undefined && (typeof s.map !== 'object' || s.map === null || Array.isArray(s.map))) {
    errors.push({ path: `${path}.map`, message: '"map" must be an object { target: source }' });
  }
  return errors;
}

export function getLabel(step: Record<string, unknown>, index: number): string {
  if (typeof step.label === 'string') return step.label;
  return (step.prompt as string) || `LLM ${index}`;
}

export function decompile(node: Record<string, unknown>, ctx: StepDecompileContext): Record<string, unknown> {
  const promptLabel = node.promptTemplateId
    ? ctx.promptMap.get(node.promptTemplateId as string) || node.promptTemplateId
    : (node as any).prompt || node.label || 'Unknown Prompt';
  const dsl: Record<string, unknown> = { type: 'llm', prompt: promptLabel };
  if (node.label && node.label !== promptLabel) dsl.label = node.label;
  if (node.description) dsl.description = node.description;
  if (node.final) dsl.final = true;
  const map = collapseRecord(node.fieldMappings as any);
  if (map) dsl.map = map;
  if (node.model) dsl.model = node.model;
  if (node.temperature !== undefined) dsl.temperature = node.temperature;
  if (node.maxTokens !== undefined) dsl.maxTokens = node.maxTokens;
  if (node.systemPrompt) dsl.systemPrompt = node.systemPrompt;
  return dsl;
}

/** Build-time facets only (no runtime or FE imports); loaded by `abuddy build` in dependent packs. */
export const llmStepBuild: StepDefinition = {
  type: 'llm',
  build: { compile, validate, getLabel, decompile, relation: { field: 'promptTemplateId', targetEntity: 'Prompt' } },
};
