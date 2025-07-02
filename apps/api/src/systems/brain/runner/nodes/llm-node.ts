/**
 * LLM Node Handler - Clean Data-Driven Architecture
 * 
 * ## Improvements Made:
 * 
 * 1. **Cleaner Event Structure**
 *    - Before: eventPayload.payload (confusing nesting)
 *    - After: event.data.payload (clear hierarchy)
 * 
 * 2. **Type-Safe Configuration**
 *    - Before: String paths like "$.eventPayload.message"
 *    - After: Constants like ContextPaths.EVENT_MESSAGE
 * 
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

import type { NodeEntity } from '@/systems/flows/types';
import type { ExecutionContext, FieldMapping } from '@/systems/brain/types';
// Template registry functionality has been moved to EARS datastore
import { applyFieldMappings } from '../field-mapper';
import { createLogger } from '@/systems/logs/logger';
import { getPromptById } from '@/systems/prompts/repository';
import { executeTemplate } from '@/systems/prompts/template-executor';
import { EARS } from '@/shared/ears/types';

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
 * Generate the prompt for the LLM
 */
function generatePrompt(
  node: LLMNode,
  context: ExecutionContext
): string {
  // Direct prompt takes precedence
  if (node.prompt) {
    return node.prompt;
  }
  
  // Use template if specified
  if (node.promptTemplateId) {
    try {
      // Get the prompt template from EARS datastore
      const prompt = getPromptById(`Prompt-${node.promptTemplateId}` as EARS.EntityId);
      if (!prompt) {
        logger.error(`Prompt template not found:`, { templateId: node.promptTemplateId });
        return 'Error: Prompt template not found';
      }

      // Apply field mappings to generate template parameters
      const params = node.fieldMappings 
        ? applyFieldMappings(node.fieldMappings, context)
        : {};
      
      logger.debug(`Template params for ${node.label}:`, params);
      
      // Execute the template function with the parameters
      return executeTemplate(prompt.templateFn, params);
    } catch (error) {
      logger.error(`Failed to generate prompt from template:`, { 
        templateId: node.promptTemplateId, 
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
  node: NodeEntity,
  executionContext: ExecutionContext,
  actor: any
) {
  const llmNode = node as LLMNode;
  
  logger.debug(`Executing LLM node: ${node.label}`, {
    model: llmNode.model || 'default',
    hasPrompt: !!llmNode.prompt,
    templateId: llmNode.promptTemplateId,
    mappingsCount: llmNode.fieldMappings?.length || 0,
  });
  
  // Generate the prompt
  const prompt = generatePrompt(llmNode, executionContext);
  
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