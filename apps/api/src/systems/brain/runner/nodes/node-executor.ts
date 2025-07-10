import type { NodeEntity } from '@/systems/flows/types';
import type { ExecutionContext, TNodeEntity } from '@/systems/brain/types';
import { fireNodeHandler } from './fire-node';
import { keepAliveNodeHandler } from './keep-alive-node';
import { llmNodeHandler } from './llm-node';
import { actionNodeHandler } from './action-node';
import { createLogger } from '@/shared/debug/logger';

const logger = createLogger('node-executor');

/**
 * Execute a node based on its type
 * Now accepts TNode which contains pre-processed attributes and mappings
 */
export function executeNode(
  tNode: TNodeEntity,
  node: NodeEntity,
  executionContext: ExecutionContext,
  actor: any
) {
  switch (node.nodeType) {
    case 'fire':
      fireNodeHandler(tNode, node, executionContext, actor);
      break;
      
    case 'keep_alive':
      keepAliveNodeHandler(tNode, node, executionContext, actor);
      break;
      
    case 'llm':
      llmNodeHandler(tNode, node, executionContext, actor);
      break;
      
    case 'action':
      actionNodeHandler(tNode, node, executionContext, actor);
      break;
      
    default:
      // For unknown node types, complete immediately
      logger.warn(`Unknown node type: ${node.nodeType}`);
      setTimeout(() => {
        actor.send({ type: 'COMPLETE', result: { executed: true } });
      }, 100);
  }
} 