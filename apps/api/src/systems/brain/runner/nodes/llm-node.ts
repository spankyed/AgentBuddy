import type { NodeEntity } from '@/systems/flows/types';
import type { ExecutionContext } from '@/systems/brain/types';

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
  
  console.log(`Executing LLM node: ${node.label}`);
  console.log(`Model: ${llmNode.model || 'default'}`);
  console.log(`Prompt: ${llmNode.prompt || 'No prompt specified'}`);
  
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