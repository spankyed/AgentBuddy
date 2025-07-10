import type { NodeEntity } from '@/systems/flows/config/types';
import type { ExecutionContext, TNodeEntity } from '@/systems/brain/types';
import { createLogger } from '@/shared/debug/logger';

const logger = createLogger('fire-node');

/**
 * Handle execution of a fire node
 * Fire nodes emit events to specific scopes
 */
export function fireNodeHandler(
  tNode: TNodeEntity,
  node: NodeEntity,
  executionContext: ExecutionContext,
  actor: any
) {
  const fireConfig = tNode.nodeAttributes || {};
  
  if (!fireConfig.eventType) {
    logger.error(`Fire node ${node.id} missing eventType`);
    actor.send({ type: 'ERROR', error: 'Missing eventType' });
    return;
  }
  
  logger.debug(`Firing event: ${fireConfig.eventType}`, {
    scope: fireConfig.scope || 'local',
    hasPayload: !!fireConfig.payload
  });
  
  // TODO: Implement actual event firing based on scope
  // For now, just simulate completion
  setTimeout(() => {
    actor.send({ 
      type: 'COMPLETE', 
      result: { 
        eventFired: fireConfig.eventType,
        eventScope: fireConfig.scope || 'local',
        payload: fireConfig.payload
      } 
    });
  }, 100);
} 