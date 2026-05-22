import type { NodeEntity } from '@/core/shared-types/flows';
import type { ExecutionContext, FieldMapping, TNodeEntity } from '@/systems/brain/types';
import { brainInspect, brainLogger } from '../utils/brain-inspect';
import { repository } from '@/repository';
import { executeTemplate } from '@/core/shared/template-executor';
import { createPromptContext } from '@/core/shared/prompt-context';
import { EARS } from '@/core/types';
import { generateText } from '@/services/llm';

interface LLMNodeConfig {
  // Core LLM settings
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  
  // Prompt configuration
  prompt?: string;                          // Direct prompt string
  promptTemplateId?: string;                // Or use a template
  fieldMappings?: FieldMapping[];           // Data-driven field mappings
}

type LLMNode = NodeEntity & LLMNodeConfig;

/**
 * Generate the prompt for the LLM using resolved data from TNode
 */
function generatePrompt(
  tNode: TNodeEntity,
  node: LLMNode
): string {
  // All config and resolved params are in nodeAttributes
  const nodeData = tNode.nodeAttributes || {};
  
  // Direct prompt takes precedence
  if (nodeData.prompt && typeof nodeData.prompt === 'string') {
    return nodeData.prompt;
  }
  
  // Use template if specified
  if (nodeData.promptTemplateId) {
    try {
      // Get the prompt template from EARS datastore
      const prompt = repository.promptQueries.byId(nodeData.promptTemplateId as EARS.EntityId);
      if (!prompt) {
        brainLogger.error(`Prompt template not found:`, { templateId: nodeData.promptTemplateId });
        return 'Error: Prompt template not found';
      }

      // User params are structurally separated during TNode creation —
      // no need to filter config keys by name.
      const templateParams: Record<string, any> = (tNode.resolvedParams as Record<string, any>) || {};
      
      brainInspect(`Using resolved params for ${node.label}:`, templateParams);
      
      // Create a prompt context that allows templates to reference other prompts
      const promptContext = createPromptContext(executeTemplate, (label: string) => repository.promptQueries.byLabel(label));
      
      // Execute the template function with the parameters and context
      const result = executeTemplate(prompt.templateFn, templateParams, promptContext);
      return result;
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

/**
 * Handle execution of an LLM node
 */
export async function llmNodeHandler(
  tNode: TNodeEntity,
  node: NodeEntity,
  executionContext: ExecutionContext,
  actor: any
) {
  const nodeData = tNode.nodeAttributes || {};

  try {
    brainInspect(`Executing LLM node: ${node.label}`, { nodeData });
    // Generate the prompt using pre-mapped params
    const prompt = generatePrompt(tNode, node as LLMNode);

    brainInspect(`Generated prompt preview: ${prompt.substring(0, 200)}${prompt.length > 200 ? '...' : ''}`);

    // Extract LLM configuration from nodeData
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

    brainInspect(`LLM response received for node: ${node.label}`, {
      usage: response.usage,
      finishReason: response.finishReason,
    });

    // Send completion with the LLM response
    actor.send({
      type: 'COMPLETE',
      result: {
        text: response.text,
        usage: response.usage,
        finishReason: response.finishReason,
      }
    });
  } catch (error) {
    brainLogger.error('Failed to handle LLM node:', { error, nodeLabel: node.label });
    actor.send({
      type: 'ERROR',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
} 

/**
 * 3. **Connected Templates**
 *    - Templates declare their inputs with types and defaults
 *    - System validates mappings against template expectations
 *    - UI can show what data is needed and available
 * 
 * 4. **Simpler Mappings**
 *    - Before: targetField, sourcePath, defaultValue, transform
 *    - After: target, source, default (transforms in template if needed)
 * 
 * ## Example Configuration:
 * ```
 * {
 *   nodeType: 'llm',
 *   promptTemplateId: 'user-message-analysis',
 *   fieldMappings: [
 *     {
 *       target: 'userMessage',
 *       source: ContextPaths.EVENT_PAYLOAD,
 *       default: '[No message]'
 *     }
 *   ]
 * }
 * ```
 * 
 * ## How Templates Work:
 * ```
 * {
 *   id: 'my-template',
 *   inputs: {
 *     userMessage: {
 *       type: 'string',
 *       required: true,
 *       commonSources: ['$.event.data.message']
 *     }
 *   },
 *   templateFn: (params) => `Message: ${params.userMessage}`
 * }
 * ```
 */
