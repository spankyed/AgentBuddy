import type { NodeEntity } from '@/systems/flows/types';
import type { ExecutionContext } from '@/systems/brain/types';
import { createLogger } from '@/systems/logs/logger';

const logger = createLogger('llm-node');

type LLMNode = NodeEntity & {
  model?: string;
  prompt?: string;
  temperature?: number;
};

/**
 * Handle execution of an LLM node
 * LLM nodes make calls to language models
 */
export function llmNodeHandler(
  node: NodeEntity,
  executionContext: ExecutionContext,
  actor: any
) {
  const llmNode = node as LLMNode;
  
  logger.debug(`Executing LLM node: ${node.label}`, {
    model: llmNode.model || 'default',
    prompt: llmNode.prompt || 'No prompt specified'
  });
  
  // TODO: Implement actual LLM call
  // For now, simulate async execution
  setTimeout(() => {
    actor.send({ 
      type: 'COMPLETE', 
      result: { 
        response: 'Simulated LLM response',
        model: llmNode.model || 'default',
        promptUsed: llmNode.prompt
      } 
    });
  }, 1000);
} 