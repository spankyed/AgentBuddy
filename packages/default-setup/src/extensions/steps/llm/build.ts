// The LLM step's DSL surface is provisional — see the note on DSLLLMNode in ./types.ts before building
// on it: the helper has no call site in this repo, so its shape has never been exercised by an author.
import type { StepBuildFacet, StepNodeFacet } from '@apack/sdk/steps';
import type { StepCompileResult, StepCompileContext, StepValidationError, StepValidationContext, StepDecompileContext } from '@apack/sdk/steps';
import { EARS } from '@apack/sdk';
import { expandRecord, collapseRecord, mapProblems } from '@apack/sdk/steps';
import { DEFAULT_MODEL } from './model.ts';
import type { FieldMapping, MapEntry } from '@apack/sdk/steps';
import { isModelId } from '@apack/sdk/models';

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
      fieldMappings: expandRecord(node.map as Record<string, MapEntry> | undefined),
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
  if (s.model !== undefined && (typeof s.model !== 'string' || !isModelId(s.model))) {
    errors.push({ path: `${path}.model`, message: `"model" must be a provider:model id (e.g. "anthropic:claude-opus-5"), got ${JSON.stringify(s.model)}` });
  }
  return [...errors, ...mapProblems(s.map, `${path}.map`)];
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
  const map = collapseRecord(node.fieldMappings as FieldMapping[] | undefined);
  if (map) dsl.map = map;
  if (node.model) dsl.model = node.model;
  if (node.temperature !== undefined) dsl.temperature = node.temperature;
  if (node.maxTokens !== undefined) dsl.maxTokens = node.maxTokens;
  if (node.systemPrompt) dsl.systemPrompt = node.systemPrompt;
  return dsl;
}

/** Build-time facets only (no runtime or FE imports); loaded by `apack build` in dependent packs. */
export const llmStepBuild: StepBuildFacet = { compile, validate, getLabel, decompile, relation: { field: 'promptTemplateId', targetEntity: 'Prompt' } };

/** What a node of this type starts with; the backend writes it and the canvas draws it */
export const llmStepNode: StepNodeFacet = {
  label: 'LLM',
  defaultLabel: 'Generate text',
  defaults: { model: DEFAULT_MODEL, maxTokens: 1000 },
};
