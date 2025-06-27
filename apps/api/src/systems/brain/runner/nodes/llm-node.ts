/**
 * LLM Node Handler - Data-Driven Approach
 * 
 * ## Design Philosophy:
 * - All intelligence is in the data (schemas and mappings)
 * - The logic is "dumb" - it just applies mappings
 * - Templates receive exactly what they declare they need
 * 
 * ## How it works:
 * 1. Each LLM node has fieldMappings that define:
 *    - What fields the template needs (targetField)
 *    - Where to get the data from (sourcePath)
 *    - Optional transforms and defaults
 * 
 * 2. The runtime simply applies these mappings
 * 
 * 3. Templates receive a clean, predictable structure
 * 
 * ## Example node configuration:
 * ```
 * {
 *   nodeType: 'llm',
 *   label: 'Analyze User Message',
 *   promptTemplateId: 'user-message-analysis',
 *   fieldMappings: [
 *     {
 *       targetField: 'userMessage',
 *       sourcePath: '$.eventPayload.message',
 *       defaultValue: '[No message]'
 *     },
 *     {
 *       targetField: 'previousSummary',
 *       sourcePath: '$.previousResults.Process User Message.result.summary'
 *     }
 *   ]
 * }
 * ```
 */

import type { NodeEntity } from '@/systems/flows/types';
import type { ExecutionContext, FieldMapping } from '@/systems/brain/types';
import { promptTemplateRegistry } from '@/systems/prompts/templates';
import { applyFieldMappings } from '../field-mapper';
import { createLogger } from '@/systems/logs/logger';

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
    const template = promptTemplateRegistry.get(node.promptTemplateId);
    if (!template) {
      logger.error(`Template ${node.promptTemplateId} not found`);
      return 'Error: Template not found';
    }
    
    try {
      // Apply field mappings to generate template parameters
      const params = node.fieldMappings 
        ? applyFieldMappings(node.fieldMappings, context)
        : {};
      
      logger.debug(`Template params for ${node.label}:`, params);
      
      return template.templateFn(params);
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