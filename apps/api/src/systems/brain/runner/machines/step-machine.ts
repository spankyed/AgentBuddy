import { setup, assign, sendParent } from 'xstate';
import type { StepMachineContext, StepEvent } from '@/systems/brain/types';
import { createStepTNode, updateTNodeStatus } from '../utils/tnode-manager';
import { getNextNodes } from '../utils/flow-data';
import { executeNode } from '../nodes/node-executor';

/**
 * Create a step execution machine
 */
export function createStepMachine() {
  return setup({
    types: {
      context: {} as StepMachineContext,
      events: {} as StepEvent,
    },
    actions: {
      createStepTNode: assign({
        tNodeId: ({ context }) => {
          const stepTNode = createStepTNode(
            context.node,
            context.parentTNodeId!,
            context.systemActor
          );
          return stepTNode.id;
        }
      }),
      
      executeStep: ({ context, self }) => {
        console.log(`Executing step: ${context.node.label} (${context.node.nodeType})`);
        
        // Delegate to node executor
        executeNode(context.node, context.executionContext, self);
      },
      
      markCompleted: ({ context }) => {
        if (context.tNodeId) {
          updateTNodeStatus(context.tNodeId, 'completed', context.systemActor);
        }
      },
      
      markFailed: ({ context }) => {
        if (context.tNodeId) {
          updateTNodeStatus(context.tNodeId, 'failed', context.systemActor);
        }
      },
      
      notifyParent: sendParent(({ context }) => {
        // Get next node(s)
        const nextNodes = getNextNodes(context.node.id!);
        const nextNode = nextNodes.length > 0 ? nextNodes[0] : undefined;
        
        return {
          type: 'CHILD_COMPLETED',
          childId: context.node.id,
          result: context.executionContext,
          nextNode,
          parentTNodeId: context.parentTNodeId,
        };
      }),
    },
  }).createMachine({
    id: `step-machine`,
    initial: 'preparing',
    context: ({ input }) => input as StepMachineContext,
    states: {
      preparing: {
        entry: 'createStepTNode',
        always: 'executing',
      },
      executing: {
        entry: 'executeStep',
        on: {
          COMPLETE: {
            target: 'completed',
            actions: assign({
              executionContext: ({ context, event }) => ({
                ...context.executionContext,
                [`${context.node.id}_result`]: event.result,
              }),
            }),
          },
          ERROR: {
            target: 'failed',
          },
        },
      },
      completed: {
        entry: ['markCompleted', 'notifyParent'],
        type: 'final',
      },
      failed: {
        entry: ['markFailed', 'notifyParent'],
        type: 'final',
      },
    },
  });
} 