import { setup, sendParent } from 'xstate';
import type { FlowMachineContext, ChildCompletedEvent } from '@/systems/brain/types';
import type { ListenNode } from '@/systems/flows/types';
import { createEventTNode } from '../utils/tnode-manager';
import { getEventResponderNode } from '../utils/flow-data';
import { spawnExecutionChain } from '../utils/execution-chain';
import { updateTNodeStatus } from '../utils/tnode-manager';

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
      
      handleChildCompletion: ({ context, event, self }: { context: FlowMachineContext, event: ChildCompletedEvent, self: any }) => {
        console.log(`Child completed in flow ${context.flowId}:`, event);
        // Remove completed child from active children
        if (event.childId) {
          context.activeChildren.delete(event.childId);
        }
        
        // Update execution context with child results
        if (event.result) {
          context.executionContext = { ...context.executionContext, ...event.result };
        }
        
        // Check if we should complete this flow
        const shouldComplete = 
          // Child has final flag
          event.result?.final === true ||
          // No next node and no other active children (natural end of execution)
          (!event.nextNode && context.activeChildren.size === 0);
        
        if (shouldComplete) {
          console.log(`Flow ${context.flowId} completing due to ${event.result?.final ? 'final flag' : 'end of execution'}`);
          self.send({ type: 'COMPLETE_FLOW' });
        } else if (event.nextNode && event.parentTNodeId) {
          // Spawn next step
          spawnExecutionChain(event.nextNode, event.parentTNodeId, context.executionContext, self, context.systemActor);
        }
      },
      
      markFlowCompleted: ({ context }) => {
        if (context.parentTNodeId) {
          updateTNodeStatus(context.parentTNodeId, 'completed', context.systemActor);
        }
      },
      
      notifyParentOfCompletion: ({ context }) => {
        // Only send to parent if there's a parent actor (non-root flows)
        if (context.parentActor) {
          context.parentActor.send({
            type: 'CHILD_COMPLETED',
            childId: context.flowId,
            result: context.executionContext,
            parentTNodeId: context.parentTNodeId,
          });
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
      isRootFlow: input.isRootFlow,
      parentActor: input.parentActor,
    }),
    on: eventHandlers,
    states: {
      active: {
        on: {
          COMPLETE_FLOW: {
            target: 'completed',
          },
        },
      },
      completed: {
        entry: ['markFlowCompleted', 'notifyParentOfCompletion'],
        type: 'final',
      },
    },
  });
} 