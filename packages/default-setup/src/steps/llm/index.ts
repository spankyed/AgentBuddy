import type { StepDefinition, StepCompileResult, StepCompileContext, StepValidationError, StepValidationContext, StepDecompileContext } from '@abuddy/sdk/steps';
import type { ExecutionContext, TNodeEntity } from '@/plugins/brain/be/types';
import type { NodeEntity } from '@/plugins/flows/be/config/types';
import { EARS } from '@/registries/ears';
import { expandFieldMappings, collapseFieldMappings } from '../shared';
import { repository } from '@abuddy/sdk/ears';
import { brainInspect, brainLogger } from '@/plugins/brain/be/utils/brain-inspect';
import { executeTemplate } from '@/plugins/brain/be/utils/template-executor';
import { createPromptContext } from '@/plugins/brain/be/utils/prompt-context';
import { generateText } from '@/plugins/brain/be/services/llm';
import { reportBrainRuntimeError } from '@/plugins/brain/be/runtime-errors';

/* ── Build facet ─────────────────────────────────────────────────────── */

function compile(
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
      fieldMappings: expandFieldMappings(node.map as Record<string, string> | undefined),
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

function validate(
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

function getLabel(step: Record<string, unknown>, index: number): string {
  if (typeof step.label === 'string') return step.label;
  return (step.prompt as string) || `LLM ${index}`;
}

/* ── Runtime facet ───────────────────────────────────────────────────── */

interface LLMNodeConfig {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  prompt?: string;
  promptTemplateId?: string;
}

type LLMNode = NodeEntity & LLMNodeConfig;

function generatePrompt(tNode: TNodeEntity, node: LLMNode): string {
  const nodeData = tNode.nodeAttributes || {};

  if (nodeData.prompt && typeof nodeData.prompt === 'string') {
    return nodeData.prompt;
  }

  if (nodeData.promptTemplateId) {
    try {
      const prompt = repository.promptQueries.byId(nodeData.promptTemplateId as EARS.EntityId);
      if (!prompt) {
        brainLogger.error(`Prompt template not found:`, { templateId: nodeData.promptTemplateId });
        return 'Error: Prompt template not found';
      }

      const templateParams: Record<string, any> = (tNode.resolvedParams as Record<string, any>) || {};

      brainInspect(`Using resolved params for ${node.label}:`, templateParams);

      const promptContext = createPromptContext(executeTemplate, (label: string) => repository.promptQueries.byLabel(label));

      return executeTemplate(prompt.templateFn, templateParams, promptContext);
    } catch (error) {
      brainLogger.error(`Failed to generate prompt from template:`, {
        templateId: nodeData.promptTemplateId,
        error
      });
      return 'Error: Failed to generate prompt';
    }
  }

  return 'No prompt specified';
}

async function handler(tNode: unknown, node: unknown, executionContext: unknown, actor: unknown) {
  const t = tNode as TNodeEntity;
  const n = node as LLMNode;
  const ctx = executionContext as ExecutionContext;
  const a = actor as { send: (event: any) => void };
  const nodeData = t.nodeAttributes || {};

  try {
    brainInspect(`Executing LLM node: ${n.label}`, { nodeData });

    const prompt = generatePrompt(t, n);

    brainInspect(`Generated prompt preview: ${prompt.substring(0, 200)}${prompt.length > 200 ? '...' : ''}`);

    const modelString = nodeData.model as string || 'anthropic:claude-3-haiku-20240307';
    const [provider, model] = modelString.split(':');

    const response = await generateText({
      model: {
        provider: provider as any,
        model: model,
      },
      prompt,
      system: nodeData.systemPrompt as string | undefined,
      temperature: nodeData.temperature as number | undefined,
      maxTokens: nodeData.maxTokens as number | undefined,
    });

    brainInspect(`LLM response received for node: ${n.label}`, {
      usage: response.usage,
      finishReason: response.finishReason,
    });

    a.send({
      type: 'COMPLETE',
      result: {
        text: response.text,
        usage: response.usage,
        finishReason: response.finishReason,
      }
    });
  } catch (error) {
    const runtimeError = reportBrainRuntimeError({
      error,
      source: 'brain-llm',
      phase: 'llm.execute',
      flowTNodeId: ctx.flowTNodeId,
      tNodeId: t.id,
      nodeId: n.id,
      nodeLabel: n.label,
      nodeType: n.nodeType,
      eventType: ctx.event?.type,
    });
    a.send({ type: 'ERROR', error: runtimeError });
  }
}

function decompile(node: Record<string, unknown>, ctx: StepDecompileContext): Record<string, unknown> {
  const promptLabel = node.promptTemplateId
    ? ctx.promptMap.get(node.promptTemplateId as string) || node.promptTemplateId
    : (node as any).prompt || node.label || 'Unknown Prompt';
  const dsl: Record<string, unknown> = { type: 'llm', prompt: promptLabel };
  if (node.label && node.label !== promptLabel) dsl.label = node.label;
  if (node.description) dsl.description = node.description;
  if (node.final) dsl.final = true;
  const map = collapseFieldMappings(node.fieldMappings as any);
  if (map) dsl.map = map;
  if (node.model) dsl.model = node.model;
  if (node.temperature !== undefined) dsl.temperature = node.temperature;
  if (node.maxTokens !== undefined) dsl.maxTokens = node.maxTokens;
  if (node.systemPrompt) dsl.systemPrompt = node.systemPrompt;
  return dsl;
}

export const llmStep: StepDefinition = {
  type: 'llm',
  build: { compile, validate, getLabel, decompile, relation: { field: 'promptTemplateId', targetEntity: 'Prompt' } },
  runtime: { handler, isAsync: true },
  fe: {
    colorKey: 'indigo',
    nodeConfig: {
      label: 'LLM',
      defaultLabel: 'Generate text',
      icon: 'Sparkle',
      color: 'text-indigo-400',
      bgColor: 'bg-indigo-500/10',
      hoverBgColor: 'group-hover:bg-indigo-500/15',
      connectionRules: { inputs: 1, outputs: 1 },
      component: 'VariableNode',
      category: 'ai',
      isImplemented: true,
      isDisabled: true,
    },
    defaults: { model: 'gpt-4', temperature: 0.7, maxTokens: 1000 },
  },
};
