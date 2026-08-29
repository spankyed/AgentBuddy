import type { NodeEntity } from '@/core/shared-types/flows';
import type { ExecutionContext, TNodeEntity } from '@/systems/brain/types';
import { brainInspect, brainLogger } from '../utils/brain-inspect';
import { sendToBrainSystem } from '@/services/event-emitter';

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
    brainLogger.error(`Fire node ${node.id} missing eventType`);
    actor.send({ type: 'ERROR', error: 'Missing eventType' });
    return;
  }

  const scope = fireConfig.scope || 'local';
  const eventType = fireConfig.eventType as string;
  const payload = fireConfig.payload;

  brainInspect(`Firing event: ${eventType}`, {
    scope,
    hasPayload: !!payload,
    flowTNodeId: executionContext.flowTNodeId
  });

  // Determine targetFlowId based on scope
  // For local events, use flowTNodeId (instance ID) for routing
  const targetFlowId = scope === 'local' ? executionContext.flowTNodeId : undefined;

  try {
    // Send TRIGGER_BRAIN_EVENT via internal event emitter
    sendToBrainSystem({
      eventType,
      payload,
      targetFlowId
    });

    // Complete the fire node execution
    actor.send({
      type: 'COMPLETE',
      result: {
        eventFired: eventType,
        eventScope: scope,
        targetFlowId,
        payload
      }
    });
  } catch (error) {
    brainLogger.error('Failed to fire event:', { eventType, error });
    actor.send({ type: 'ERROR', error: 'Failed to fire event' });
  }
} 