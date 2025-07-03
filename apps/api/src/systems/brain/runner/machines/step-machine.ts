import { setup, assign, sendParent } from 'xstate';
import { NodeEntity, EARS, ExecutionContext } from '@/types';
import { executeNode } from '../nodes/node-executor';
import {
  createStepTNode,
  updateTNodeStatus,
} from '../../repository/tnode-manager';
import { createLogger } from '@/systems/logs/logger';

const logger = createLogger('step-machine');

type StepMachineContext = {
  tNodeId?: EARS.EntityId;
  step: NodeEntity;
  eventTNodeId?: EARS.EntityId;
  executionContext: ExecutionContext;
};

type StepEvent = {
  type: 'CANCEL' | 'COMPLETE' | 'ERROR';
  result?: any;
  error?: any;
};

type StepMachineInput = {
  executionContext: ExecutionContext; // Replace with actual execution context type
};

/**
 * Create a step execution machine
 */
export function createStepMachine(
  stepId: EARS.EntityId,
  eventTNodeId: EARS.EntityId,
) {
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
          logger.debug(
            `Executing step: ${context.step.label} (${context.step.nodeType})`,
          );

          // Delegate to step executor
          executeNode(context.step, context.executionContext, self);
        },
        markCompleted: ({ context, self }) => {
          if (context.tNodeId) {
            updateTNodeStatus(context.tNodeId, 'completed', self);
          }
        },
        markFailed: ({ context, self }) => {
          if (context.tNodeId) {
            updateTNodeStatus(context.tNodeId, 'failed', self);
          }
        },
        notifyComplete: sendParent(({ context, event }) => ({
          type: 'CHILD_COMPLETED',
          stepId: context.step.id,
          stepLabel: context.step.label,
          tNodeId: context.tNodeId,
          result: event.result,
          final: context.step.final || false,
          eventTNodeId: context.eventTNodeId,
        })),
      },
    }).createMachine({
      id: `step-machine`,
      initial: 'executing',
      context: ({ input }) => ({
        tNodeId: tNode.id,
        step: step,
        eventTNodeId: eventTNodeId,
        executionContext: input.executionContext || ({} as ExecutionContext),
      }),
      states: {
        executing: {
          entry: 'executeStep',
          on: {
            COMPLETE: {
              target: 'completed',
              actions: 'notifyComplete',
            },
            ERROR: {
              target: 'failed',
            },
          },
        },
        completed: {
          entry: ['markCompleted'],
          type: 'final',
        },
        failed: {
          entry: ['markFailed'],
          type: 'final',
        },
      },
    })
  }
}
