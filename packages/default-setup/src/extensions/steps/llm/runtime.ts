import type { ExecutionContext, TNodeEntity } from '@abuddy/sdk/steps';
import type { NodeEntity } from '@/__generated__/types';
import { EARS } from '@abuddy/sdk';
import { repository } from '@/__generated__/repository';
import { createLogger, reportError } from '@abuddy/sdk/logger';
import { executeTemplate, createTemplateResolver } from '@abuddy/sdk/templates';
import { services } from '@abuddy/sdk/services';
import { isModelId } from '@abuddy/sdk/models';
import { DEFAULT_MODEL } from './model';

const brainLogger = createLogger('brain', { debug: true });

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

      brainLogger.debug(`Using resolved params for ${node.label}:`, templateParams);

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
    brainLogger.debug(`Executing LLM node: ${n.label}`, { nodeData });

    const prompt = generatePrompt(t, n);

    brainLogger.debug(`Generated prompt preview: ${prompt.substring(0, 200)}${prompt.length > 200 ? '...' : ''}`);

    const model = (nodeData.model as string | undefined) || DEFAULT_MODEL;
    if (!isModelId(model)) {
      throw new Error(`LLM node "${n.label}" names model "${model}": expected provider:model, e.g. ${DEFAULT_MODEL}`);
    }

    const response = await services.inference.generateText({
      model,
      prompt,
      instructions: nodeData.systemPrompt as string | undefined,
      temperature: nodeData.temperature as number | undefined,
      maxOutputTokens: nodeData.maxTokens as number | undefined,
    });

    brainLogger.debug(`LLM response received for node: ${n.label}`, {
      usage: response.usage,
      finishReason: response.finishReason,
    });

    // The provider ignored part of the call, e.g. `temperature` on a reasoning model: kept on the step's result
    const warnings = response.warnings ?? [];
    if (warnings.length > 0) {
      brainLogger.warn(`LLM node "${n.label}" ran with provider warnings`, { model, warnings });
    }

    a.send({
      type: 'COMPLETE',
      result: {
        text: response.text,
        usage: response.usage,
        finishReason: response.finishReason,
        ...(warnings.length > 0 && { warnings }),
      }
    });
  } catch (error) {
    const runtimeError = reportError({
      error,
      source: 'brain-llm',
      step: {
        phase: 'llm.execute',
        flowTNodeId: ctx.flowTNodeId,
        tNodeId: t.id,
        nodeId: n.id,
        nodeLabel: n.label,
        nodeType: n.nodeType,
        eventType: ctx.event?.type,
      },
    });
    a.send({ type: 'ERROR', error: runtimeError });
  }
}
