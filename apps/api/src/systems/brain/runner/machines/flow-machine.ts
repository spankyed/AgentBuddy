import { setup, sendParent, assign } from 'xstate';
import type { FlowMachineContext, ChildCompletedEvent } from '@/systems/brain/types';
import type { ListenNode } from '@/systems/flows/types';
import { createEventTNode, updateTNodeStatus } from '../utils/tnode-manager';
import { getEventResponderNode } from '../utils/flow-data';
import { spawnChildMachine } from '../utils/spawn-child';

/**
 * Create a dynamic state machine for a flow that listens to its events
 */
export function createFlowMachine(flowId: string, eventNodes: ListenNode[]) {
  const eventHandlers: Record<string, any> = {};
  
  // Add event listeners
  eventNodes.forEach(node => {
    eventHandlers[node.eventType] = {
      actions: ['handleFlowEvent', 'incrementChildCount'],
    };
  });

  // Add child completion handler
  eventHandlers['CHILD_COMPLETED'] = {
    actions: ['processChildCompletion', 'checkFlowCompletion'],
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
        
        const responderNode = getEventResponderNode(eventNode.id!);
        if (responderNode) {
          const eventTNode = createEventTNode(eventNode, context.parentTNodeId, context.systemActor);
          const updatedContext = {
            ...context.executionContext,
            eventPayload: event.payload,
            currentEvent: eventType,
          };
          
          spawnChildMachine(responderNode, eventTNode.id, updatedContext, self, context.systemActor);
        }
      },
      
      incrementChildCount: assign({
        activeChildrenCount: ({ context, event }) => {
          const eventNode = context.eventNodes.find(n => n.eventType === event.type);
          const responderNode = eventNode ? getEventResponderNode(eventNode.id!) : null;
          return responderNode ? context.activeChildrenCount + 1 : context.activeChildrenCount;
        }
      }),
      
      processChildCompletion: assign({
        activeChildrenCount: ({ context, event }: { context: FlowMachineContext, event: ChildCompletedEvent }) => {
          // Decrement for completed child, increment if there's a next node
          const decremented = Math.max(0, context.activeChildrenCount - 1);
          return event.nextNode ? decremented + 1 : decremented;
        },
        executionContext: ({ context, event }: { context: FlowMachineContext, event: ChildCompletedEvent }) => 
          event.result ? { ...context.executionContext, ...event.result } : context.executionContext
      }),
      
      checkFlowCompletion: ({ context, event, self }: { context: FlowMachineContext, event: ChildCompletedEvent, self: any }) => {
        console.log(`Child completed in flow ${context.flowId}:`, event);
        
        // Complete flow if: has final flag OR no next node and no active children
        if (event.result?.final || (!event.nextNode && context.activeChildrenCount === 0)) {
          console.log(`Flow ${context.flowId} completing`);
          self.send({ type: 'COMPLETE_FLOW' });
        } else if (event.nextNode && event.parentTNodeId) {
          spawnChildMachine(event.nextNode, event.parentTNodeId, context.executionContext, self, context.systemActor);
        }
      },
      
      markFlowCompleted: ({ context }) => {
        if (context.parentTNodeId) {
          updateTNodeStatus(context.parentTNodeId, 'completed', context.systemActor);
        }
      },
      
      notifyParentOfCompletion: sendParent(({ context }) => ({
        type: 'CHILD_COMPLETED',
        childId: context.flowId,
        result: context.executionContext,
        parentTNodeId: context.parentTNodeId,
      })),
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
      activeChildrenCount: 0,
    }),
    on: eventHandlers,
    states: {
      active: {
        on: {
          COMPLETE_FLOW: 'completed',
        },
      },
      completed: {
        entry: ['markFlowCompleted', 'notifyParentOfCompletion'],
        type: 'final',
      },
    },
  });
} 