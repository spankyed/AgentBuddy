import type { NodeEntity } from '@/systems/flows/config/types';
import type { ExecutionContext, TNodeEntity } from '@/systems/brain/types';
import type { FireNodeEvent, EventScope } from '@/systems/brain/types/event-routing';
import type { EARS } from '@/core/types';
import { brainDebug, brainLogger } from '../utils/brain-debug';
import { brainEventBus } from '../services/event-bus';
import { flowRegistry } from '../services/flow-registry';

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
  
  brainDebug(`Firing event: ${fireConfig.eventType}`, {
    scope: fireConfig.scope || 'self',
    target: fireConfig.target,
    hasPayload: !!fireConfig.payload
  });
  
  // Find the flow instance this node belongs to
  // We need to traverse up from the tNode to find the flow
  const flowTNodeId = findContainingFlow(tNode);
  
  if (!flowTNodeId) {
    brainLogger.error(`Cannot fire event: Unable to find containing flow for node ${tNode.id}`);
    actor.send({ type: 'ERROR', error: 'Cannot find containing flow' });
    return;
  }
  
  // Create the fire event with routing
  const fireEvent: FireNodeEvent = {
    eventType: String(fireConfig.eventType),  // Ensure it's a string
    payload: fireConfig.payload,
    target: fireConfig.target || {
      scope: (fireConfig.scope as EventScope) || 'self'
    }
  };
  
  try {
    // Use the event bus to route the event
    brainEventBus.sendFromFireNode(flowTNodeId, fireEvent);
    
    // Report success
    actor.send({ 
      type: 'COMPLETE', 
      result: { 
        eventFired: fireConfig.eventType,
        eventScope: fireConfig.scope || 'self',
        target: fireConfig.target,
        payload: fireConfig.payload
      } 
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    brainLogger.error(`Failed to fire event from node ${node.id}`, { error: errorMessage });
    actor.send({ 
      type: 'ERROR', 
      error: `Failed to fire event: ${errorMessage}` 
    });
  }
}

/**
 * Find the containing flow TNode ID for a given node
 * This traverses up the TNode hierarchy to find the flow
 */
function findContainingFlow(tNode: TNodeEntity): EARS.EntityId | null {
  // If this is already a flow node, return its ID
  if (tNode.tNodeType === 'flow') {
    return tNode.id!;
  }
  
  // For step nodes, we need to find their parent flow
  // This is a simplified version - in reality we'd query the EARS database
  // to follow the SPAWNED relationships up to the flow
  
  // For now, check if the tNode has blueprint info that can help us
  if (tNode.blueprint?.flowId) {
    // Try to find the flow instance by blueprint
    const flows = flowRegistry.findBySelector({ 
      flowId: tNode.blueprint.flowId 
    });
    
    // Return the first active flow instance
    // In a more sophisticated implementation, we'd track the exact instance
    return flows.find(f => f.status === 'active')?.flowTNodeId || null;
  }
  
  // Fallback: Try to extract from the actor system ID if available
  // This is a workaround until we have proper flow tracking
  return null;
} 