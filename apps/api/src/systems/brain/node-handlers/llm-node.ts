import type { NodeEntity } from '@/systems/flows/config/types';
import type { ExecutionContext, FieldMapping, TNodeEntity } from '@/systems/brain/types';
import { createLogger } from '@/core/utils/debug/logger';
import { repository } from '@/repository';
import { executeTemplate } from '@/systems/brain/utils/template-executor';
import { EARS } from '@/core/types';

const logger = createLogger('llm-node');

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
  if (nodeData.prompt) {
    return nodeData.prompt;
  }
  
  // Use template if specified
  if (nodeData.promptTemplateId) {
    try {
      // Get the prompt template from EARS datastore
      const prompt = repository.promptQueries.byId(nodeData.promptTemplateId as EARS.EntityId);
      if (!prompt) {
        logger.error(`Prompt template not found:`, { templateId: nodeData.promptTemplateId });
        return 'Error: Prompt template not found';
      }

      // Extract template parameters from nodeAttributes
      // These were already resolved during TNode creation via fieldMappings
      const templateParams: Record<string, any> = {};
      
      // The resolved field mapping values are directly in nodeAttributes
      // We need to separate them from the config fields
      const configFields = ['model', 'temperature', 'maxTokens', 'systemPrompt', 'prompt', 'promptTemplateId'];
      for (const [key, value] of Object.entries(nodeData)) {
        if (!configFields.includes(key)) {
          templateParams[key] = value;
        }
      }
      
      logger.debug(`Using resolved params for ${node.label}:`, templateParams);
      
      // Execute the template function with the parameters
      return executeTemplate(prompt.templateFn, templateParams);
    } catch (error) {
      logger.error(`Failed to generate prompt from template:`, { 
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
export function llmNodeHandler(
  tNode: TNodeEntity,
  node: NodeEntity,
  executionContext: ExecutionContext, // ? wonder if may no longer need here
  actor: any
) {
  const llmNode = node as LLMNode;
  const nodeData = tNode.nodeAttributes || {};
  
  logger.debug(`Executing LLM node: ${node.label}`, {
    nodeData,
    tNode,
    nodeAttributeKeys: Object.keys(nodeData),
  });
  
  // Generate the prompt using pre-mapped params
  const prompt = generatePrompt(tNode, llmNode);
  
  logger.debug(`Generated prompt:`, {
    nodeLabel: node.label,
    promptPreview: prompt.substring(0, 200) + (prompt.length > 200 ? '...' : ''),
  });
  
  // TODO: Implement actual LLM call
  // For now, simulate async execution with mock response
  setTimeout(() => {
    // Simulate different responses based on the node
    let mockResponse: any;
    
    if (node.label === 'Process User Message') {
      mockResponse = {
        summary: 'User is asking for help with debugging',
        intent: 'technical_support',
        entities: ['debugging', 'help'],
        category: 'programming_help',
        urgency: 'medium'
      };
    } else if (node.label === 'Format Response') {
      mockResponse = {
        formattedMessage: 'I understand you need help with debugging. Let me assist you with that.',
        responseType: 'helpful',
        suggestedActions: ['provide_debugging_tips', 'ask_for_code_snippet']
      };
    } else {
      mockResponse = {
        result: `Processed prompt for ${node.label}`,
        prompt: prompt.substring(0, 100) + '...',
        timestamp: Date.now()
      };
    }
    
    actor.send({ 
      type: 'COMPLETE', 
      result: mockResponse
    });
  }, 1000);
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
