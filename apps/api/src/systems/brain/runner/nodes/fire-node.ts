import type { NodeEntity } from '@/systems/flows/types';
import type { ExecutionContext } from '@/systems/brain/types';
import { createLogger } from '@/systems/logs/logger';

const logger = createLogger('fire-node');

type FireNode = NodeEntity & {
  eventType?: string;
  eventScope?: 'local' | 'global' | 'parent';
};

/**
 * Handle execution of a fire node
 * Fire nodes emit events to specific scopes
 */
export function fireNodeHandler(
  node: NodeEntity,
  executionContext: ExecutionContext,
  actor: any
) {
  const fireNode = node as FireNode;
  
  if (!fireNode.eventType) {
    logger.error(`Fire node ${node.id} missing eventType`);
    actor.send({ type: 'ERROR', error: 'Missing eventType' });
    return;
  }
  
  logger.debug(`Firing event: ${fireNode.eventType} (scope: ${fireNode.eventScope || 'local'})`);
  
  // TODO: Implement actual event firing based on scope
  // For now, just simulate completion
  setTimeout(() => {
    actor.send({ 
      type: 'COMPLETE', 
      result: { 
        eventFired: fireNode.eventType,
        eventScope: fireNode.eventScope || 'local',
        // The final flag is set at the blueprint node level, not here
        // If this node is marked as final in the flow definition,
        // it will automatically trigger parent flow completion
      } 
    });
  }, 100);
} 