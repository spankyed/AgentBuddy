import type { NodeEntity } from '@/systems/flows/types';
import type { ExecutionContext } from '@/systems/brain/types';
import type { PromptConfig, InputMapping } from '@/systems/prompts/types';
import { promptTemplateRegistry } from '@/systems/prompts/templates';
import { createLogger } from '@/systems/logs/logger';

const logger = createLogger('llm-node');

type LLMNode = NodeEntity & {
  model?: string;
  prompt?: string;
  promptConfig?: PromptConfig;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
};

/**
 * Resolves an input mapping to get the actual value
 */
function resolveInputMapping(
  mapping: InputMapping,
  executionContext: ExecutionContext
): any {
  const { source, transform } = mapping;
  let value: any;

  logger.debug(`Resolving input mapping:`, { 
    paramName: mapping.paramName,
    sourceType: source.type,
    sourcePath: source.path,
    transform
  });

  switch (source.type) {
    case 'static':
      value = source.value;
      break;

    case 'eventPayload':
      if (!executionContext.eventPayload) {
        logger.warn('eventPayload is undefined in execution context');
        return undefined;
      }
      value = getValueByPath(executionContext.eventPayload, source.path || '');
      logger.debug(`Resolved eventPayload value:`, { 
        path: source.path,
        eventPayload: executionContext.eventPayload,
        resolvedValue: value 
      });
      break;

    case 'previousStep':
      if (!source.stepId) {
        logger.warn('previousStep source missing stepId');
        return undefined;
      }
      // Find the specific step's result
      const stepResult = executionContext.previousResults.find(
        r => r.stepId === source.stepId
      );
      if (!stepResult) {
        logger.warn(`Previous step ${source.stepId} not found in execution context`);
        return undefined;
      }
      value = getValueByPath(stepResult, source.path || 'result');
      logger.debug(`Resolved previousStep value:`, { 
        stepId: source.stepId,
        path: source.path,
        stepResult,
        resolvedValue: value 
      });
      break;

    case 'context':
      // Access any part of the execution context
      value = getValueByPath(executionContext, source.path || '');
      break;

    case 'expression':
      // For now, treat expression same as context
      // In a real implementation, this might evaluate JavaScript expressions
      value = getValueByPath(executionContext, source.path || '');
      break;

    default:
      logger.warn(`Unknown source type: ${source.type}`);
      return undefined;
  }

  // Apply transformation if specified
  if (transform && value !== undefined) {
    switch (transform) {
      case 'toString':
        value = String(value);
        break;
      case 'toNumber':
        value = Number(value);
        break;
      case 'toBoolean':
        value = Boolean(value);
        break;
      case 'toJSON':
        value = JSON.stringify(value);
        break;
    }
  }

  return value;
}

/**
 * Gets a value from an object using a dot-notation path
 * Supports array indexing like "previousResults[0].result"
 */
function getValueByPath(obj: any, path: string): any {
  if (!path || path === '') return obj;
  
  // Handle root-level access (empty path or just ".")
  if (path === '.' || path === '') {
    return obj;
  }
  
  // Convert array notation to dot notation for simplicity
  // e.g., "previousResults[0].result" -> "previousResults.0.result"
  const normalizedPath = path.replace(/\[(\d+)\]/g, '.$1');
  
  try {
    return normalizedPath.split('.').reduce((current, key) => {
      if (current === null || current === undefined) {
        logger.debug(`Path resolution stopped at null/undefined for key: ${key}`);
        return undefined;
      }
      return current[key];
    }, obj);
  } catch (error) {
    logger.error(`Error resolving path ${path}:`, { error, obj });
    return undefined;
  }
}

/**
 * Generate the final prompt from the node configuration
 */
function generatePrompt(
  node: LLMNode,
  executionContext: ExecutionContext
): string {
  // If no promptConfig, use legacy prompt
  if (!node.promptConfig || node.promptConfig.type === 'static') {
    return node.promptConfig?.staticPrompt || node.prompt || 'No prompt specified';
  }

  // Handle template-based prompts
  const { templateId, inputMappings = [] } = node.promptConfig;
  
  if (!templateId) {
    logger.error('Template ID not specified in promptConfig');
    return node.prompt || 'No prompt specified';
  }

  const template = promptTemplateRegistry.get(templateId);
  if (!template) {
    logger.error(`Template ${templateId} not found in registry`);
    return node.prompt || 'No prompt specified';
  }

  // Resolve all input mappings
  const params: Record<string, any> = {};
  
  // First, set default values from template
  template.params.forEach(param => {
    if (param.defaultValue !== undefined) {
      params[param.name] = param.defaultValue;
    }
  });

  // Then, resolve mapped values
  inputMappings.forEach(mapping => {
    try {
      const value = resolveInputMapping(mapping, executionContext);
      if (value !== undefined) {
        params[mapping.paramName] = value;
      }
    } catch (error) {
      logger.error(`Failed to resolve input mapping for ${mapping.paramName}:`, { error });
    }
  });

  // Generate the prompt using the template
  try {
    return template.templateFn(params);
  } catch (error: unknown) {
    logger.error(`Failed to generate prompt from template ${templateId}:`, { error });
    return node.prompt || 'No prompt specified';
  }
}

/**
 * Handle execution of an LLM node
 * LLM nodes make calls to language models
 */
export function llmNodeHandler(
  node: NodeEntity,
  executionContext: ExecutionContext,
  actor: any
) {
  console.log('llmNodeHandler reached: ');

  const llmNode = node as LLMNode;
  
  // Generate the final prompt
  const finalPrompt = generatePrompt(llmNode, executionContext);
  
  logger.debug(`Executing LLM node: ${node.label}`, {
    model: llmNode.model || 'default',
    promptConfig: llmNode.promptConfig,
    finalPrompt: finalPrompt.substring(0, 200) + '...' // Log first 200 chars
  });
  
  // Log resolved inputs for debugging
  if (llmNode.promptConfig?.type === 'template' && llmNode.promptConfig.inputMappings) {
    const resolvedInputs: Record<string, any> = {};
    const errors: string[] = [];
    
    llmNode.promptConfig.inputMappings.forEach(mapping => {
      try {
        const value = resolveInputMapping(mapping, executionContext);
        if (value === undefined) {
          errors.push(`${mapping.paramName}: [Undefined]`);
          resolvedInputs[mapping.paramName] = '[Undefined]';
        } else {
          resolvedInputs[mapping.paramName] = value;
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push(`${mapping.paramName}: [Error: ${errorMsg}]`);
        resolvedInputs[mapping.paramName] = `[Error: ${errorMsg}]`;
      }
    });
    
    logger.debug('Resolved inputs:', resolvedInputs);
    
    if (errors.length > 0) {
      logger.warn('Some inputs could not be resolved:', errors);
    }
  }
  
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
      mockResponse = 'Simulated LLM response';
    }
    
    actor.send({ 
      type: 'COMPLETE', 
      result: mockResponse
    });
  }, 1000);
} 