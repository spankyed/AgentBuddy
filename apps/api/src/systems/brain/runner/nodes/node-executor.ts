import type { NodeEntity } from '@/systems/flows/types';
import type { ExecutionContext } from '@/systems/brain/types';
import { fireNodeHandler } from './fire-node';
import { keepAliveNodeHandler } from './keep-alive-node';
import { llmNodeHandler } from './llm-node';
import { actionNodeHandler } from './action-node';
import { createLogger } from '@/systems/logs/logger';

const logger = createLogger('node-executor');

/**
 * Execute a node based on its type
 */
export function executeNode(
  node: NodeEntity,
  executionContext: ExecutionContext,
  actor: any
) {
  switch (node.nodeType) {
    case 'fire':
      fireNodeHandler(node, executionContext, actor);
      break;
      
    case 'keep_alive':
      keepAliveNodeHandler(node, executionContext, actor);
      break;
      
    case 'llm':
      llmNodeHandler(node, executionContext, actor);
      break;
      
    case 'action':
      actionNodeHandler(node, executionContext, actor);
      break;
      
    default:
      // For unknown node types, complete immediately
      logger.warn(`Unknown node type: ${node.nodeType}`);
      setTimeout(() => {
        actor.send({ type: 'COMPLETE', result: { executed: true } });
      }, 100);
  }
} 