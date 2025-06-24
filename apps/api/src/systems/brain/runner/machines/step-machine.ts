import { setup, assign, sendParent } from 'xstate';
import { NodeEntity, EARS, ExecutionContext } from '@/types';
import { executeNode } from '../nodes/node-executor';
import { createStepTNode, updateTNodeStatus } from '../../repository/tnode-manager';

type StepMachineContext = {
  tNodeId?: EARS.EntityId;
  step: NodeEntity;
  eventTNodeId?: EARS.EntityId;
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
  executionContext: ExecutionContext; // Replace with actual execution context type
  systemActor?: any; // Replace with actual system actor type
};

/**
 * Create a step execution machine
 */
export function createStepMachine(stepId: EARS.EntityId, eventTNodeId: EARS.EntityId) {
  const { tNode, step } = createStepTNode(stepId, eventTNodeId);
  return {
    tNodeId: tNode.id,
    machine: setup({
      types: {
        context: {} as StepMachineContext,
        events: {} as StepEvent,
        input: {} as StepMachineInput,
      },
      actions: {
        executeStep: ({ context, self }) => {
          console.log(`Executing step: ${context.step.label} (${context.step.nodeType})`);
        
          // Delegate to step executor
          executeNode(context.step, context.executionContext, self);
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

        appendResult: assign({
          executionContext: ({ context, event }) => ({
            ...context.executionContext,
            [`${context.step.id}_result`]: event.result,
          }),
        }),
      
        notifyParent: sendParent(({ context }) => {
          return {
            type: 'CHILD_COMPLETED',
            stepId: context.step.id,
            tNodeId: context.tNodeId,
            result: {
              ...context.executionContext,
              // Include the step's final flag if it exists
              ...(context.step.final && { final: true })
            },
            eventTNodeId: context.eventTNodeId,
          };
        }),
      },
    }).createMachine({
      id: `step-machine`,
      initial: 'executing',
      context: ({ input }) => ({
        tNodeId: tNode.id, // Will be set in preparing state
        step: step,
        eventTNodeId: eventTNodeId,
        executionContext: input.executionContext || {} as ExecutionContext,
        systemActor: input.systemActor,
      }),
      states: {
        executing: {
          entry: 'executeStep',
          on: {
            COMPLETE: {
              target: 'completed',
              actions: 'appendResult',
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
    })
  }
}
