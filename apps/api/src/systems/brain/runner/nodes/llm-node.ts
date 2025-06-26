/**
 * LLM Node Handler - Simplified Approach
 * 
 * This handler executes LLM (Language Model) nodes in the flow system.
 * 
 * ## Design Philosophy:
 * - Keep it simple - no complex path resolution or input mappings
 * - Pass the full execution context to templates
 * - Let templates extract what they need
 * - Provide helpful utilities in the context
 * 
 * ## How it works:
 * 1. LLM nodes can have either:
 *    - A direct prompt string, OR
 *    - A template ID that references a registered prompt template
 * 
 * 2. Templates receive a params object with:
 *    - `context`: The full execution context including:
 *      - eventType: The event that triggered this flow
 *      - eventPayload: All data from the event
 *      - previousResults: Array of all previous step results
 *      - Helper functions like getResultByLabel()
 *    - Any custom parameters defined in the node config
 * 
 * 3. Templates are simple functions that:
 *    - Take the params object
 *    - Extract what they need from context
 *    - Return a prompt string
 * 
 * ## Example node configuration:
 * ```
 * {
 *   nodeType: 'llm',
 *   label: 'Analyze User Message',
 *   promptTemplateId: 'user-message-analysis',
 *   promptTemplateParams: {
 *     additionalContext: 'Customer support chat'
 *   },
 *   model: 'gpt-4',
 *   temperature: 0.7
 * }
 * ```
 * 
 * ## Example template:
 * ```
 * templateFn: (params) => {
 *   const context = params.context;
 *   const userMessage = context.eventPayload?.message || 'No message';
 *   const lastResult = context.lastResult;
 *   
 *   return `Analyze: ${userMessage}...`;
 * }
 * ```
 */

import type { NodeEntity } from '@/systems/flows/types';
import type { ExecutionContext } from '@/systems/brain/types';
import { promptTemplateRegistry } from '@/systems/prompts/templates';
import { createLogger } from '@/systems/logs/logger';

const logger = createLogger('llm-node');

interface LLMNodeConfig {
  // Core LLM settings
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  
  // Prompt configuration
  prompt?: string;                    // Direct prompt string
  promptTemplateId?: string;          // Or use a template
  promptTemplateParams?: Record<string, any>; // Simple key-value params for template
}

type LLMNode = NodeEntity & LLMNodeConfig;

/**
 * Build prompt template parameters from execution context
 * This is where we handle all the "smart" parameter resolution
 */
function buildTemplateParams(
  node: LLMNode,
  context: ExecutionContext
): Record<string, any> {
  // Start with any explicit params from the node configuration
  const params = { ...node.promptTemplateParams };
  
  // Add common context values that templates might need
  // Templates can pick what they need from this
  params.context = {
    // Event information
    eventType: context.eventType,
    eventPayload: context.eventPayload,
    
    // Previous step results as a simple array
    previousResults: context.previousResults,
    
    // Helper to get the last result
    lastResult: context.previousResults.length > 0 
      ? context.previousResults[context.previousResults.length - 1].result 
      : null,
    
    // Helper to get result by step label
    getResultByLabel: (label: string) => {
      const step = context.previousResults.find(r => r.stepLabel === label);
      return step?.result;
    },
    
    // Node information
    nodeLabel: node.label,
    nodeId: node.id,
  };
  
  return params;
}

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
      const params = buildTemplateParams(node, context);
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
  });
  
  // Generate the prompt
  const prompt = generatePrompt(llmNode, executionContext);
  
  logger.debug(`Generated prompt:`, {
    nodeLabel: node.label,
    promptPreview: prompt.substring(0, 200) + (prompt.length > 200 ? '...' : ''),
    fullContext: {
      eventType: executionContext.eventType,
      eventPayload: executionContext.eventPayload,
      previousStepsCount: executionContext.previousResults.length,
    }
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