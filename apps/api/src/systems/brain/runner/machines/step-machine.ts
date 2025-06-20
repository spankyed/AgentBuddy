import { setup, assign, sendParent } from 'xstate';
import { createStepTNode, getNextNodes, updateTNodeStatus } from '../../repository/tnode-manager';
import { executeNode } from '../nodes/node-executor';
import { NodeEntity, EARS, ExecutionContext } from '@/types';

type StepMachineContext = {
  node: NodeEntity;
  parentTNodeId?: EARS.EntityId;
  tNodeId?: EARS.EntityId;
  executionContext: ExecutionContext;
  systemActor?: any;
}

type StepEvent = 
  | {
    type: 'EXECUTE' | 'COMPLETE' | 'ERROR';
    result?: any;
    error?: any;
  }


type StepMachineInput = {
  node: any; // Replace with actual node type
  parentTNodeId: string;
  executionContext: any; // Replace with actual execution context type
  systemActor?: any; // Replace with actual system actor type
};

/**
 * Create a step execution machine
 */
export function createStepMachine() {
  return setup({
    types: {
      context: {} as StepMachineContext,
      events: {} as StepEvent,
      input: {} as StepMachineInput,
    },
    actions: {
      createStepTNode: assign({
        tNodeId: ({ context, system }) => {
          const stepTNode = createStepTNode(
            context.node,
            context.parentTNodeId!,
          );

          // emitTNodeEvent('EVENT_TNODE_SPAWNED', { tNode: stepTNode }, system);
          
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
          result: {
            ...context.executionContext,
            // Include the node's final flag if it exists
            ...(context.node.final && { final: true })
          },
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