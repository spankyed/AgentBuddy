import type { ExecutionContext, TNodeEntity } from '@abuddy/sdk/steps';
import type { NodeEntity } from '@/plugins/flows/be/config/types';
import { EARS } from '@abuddy/sdk';
import { repository } from '@abuddy/sdk/ears';
import { createInspectLogger } from '@abuddy/sdk/logger';
import { executeTemplate, createTemplateResolver } from '@abuddy/sdk/templates';
import { generateText } from '@abuddy/sdk/inference';
import { reportBrainRuntimeError } from '@/plugins/brain/be/runtime-errors';

const { inspect: brainInspect, logger: brainLogger } = createInspectLogger('brain');

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

      const promptContext = createTemplateResolver(executeTemplate, (label: string) => repository.promptQueries.byLabel(label));

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

export async function handler(t: TNodeEntity, node: unknown, ctx: ExecutionContext, actor: unknown) {
  const n = node as LLMNode;
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
