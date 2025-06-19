import { setup } from 'xstate';
import type { FlowMachineContext, ChildCompletedEvent } from '@/systems/brain/types';
import type { ListenNode } from '@/systems/flows/types';
import { createEventTNode } from '../utils/tnode-manager';
import { getEventResponderNode } from '../utils/flow-data';
import { spawnExecutionChain } from '../utils/execution-chain';

/**
 * Create a dynamic state machine for a flow that listens to its events
 */
export function createFlowMachine(flowId: string, eventNodes: ListenNode[]) {
  // Build event handlers dynamically
  const eventHandlers: Record<string, any> = {};
  
  eventNodes.forEach(node => {
    eventHandlers[node.eventType] = {
      actions: 'handleFlowEvent',
    };
  });

  // Add child completion handler
  eventHandlers['CHILD_COMPLETED'] = {
    actions: 'handleChildCompletion',
  };

  return setup({
    types: {
      context: {} as FlowMachineContext,
      events: {} as any,
    },
    actions: {
      handleFlowEvent: ({ context, event, self }) => {
        const eventType = event.type;
        const eventNode = context.eventNodes.find(n => n.eventType === eventType);
        
        if (!eventNode) return;
        
        console.log(`Flow ${context.flowId} received event: ${eventType}`);
        
        // Get the responder node for this event
        const responderNode = getEventResponderNode(eventNode.id!);
        
        if (responderNode) {
          // Create event TNode first
          const eventTNode = createEventTNode(eventNode, context.parentTNodeId, context.systemActor);
          
          // Update execution context with event payload
          const updatedContext = {
            ...context.executionContext,
            eventPayload: event.payload,
            currentEvent: eventType,
          };
          
          // Spawn execution chain starting from responder
          spawnExecutionChain(responderNode, eventTNode.id, updatedContext, self, context.systemActor);
        }
      },
      
      handleChildCompletion: ({ context, event }: { context: FlowMachineContext, event: ChildCompletedEvent, self: any }) => {
        console.log(`Child completed in flow ${context.flowId}:`, event);
        // Remove completed child from active children
        if (event.childId) {
          context.activeChildren.delete(event.childId);
        }
        
        // Update execution context with child results
        if (event.result) {
          context.executionContext = { ...context.executionContext, ...event.result };
        }
        
        // Spawn next step if there is one
        if (event.nextNode && event.parentTNodeId) {
          spawnExecutionChain(event.nextNode, event.parentTNodeId, context.executionContext, arguments[0].self, context.systemActor);
        }
      },
    },
  }).createMachine({
    id: `flow-${flowId}`,
    initial: 'active',
    context: ({ input }: any) => ({
      flowId: input.flowId,
      parentTNodeId: input.parentTNodeId,
      eventNodes: input.eventNodes,
      executionContext: input.executionContext || {},
      systemActor: input.systemActor,
      activeChildren: new Map(),
    }),
    on: eventHandlers,
    states: {
      active: {
        // Flow is actively listening for events
      },
    },
  });
} 