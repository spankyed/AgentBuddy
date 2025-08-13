import { setup, assign, sendParent } from 'xstate';
import { NodeEntity, EARS, ExecutionContext, TNodeEntity } from '@/types';
import { executeNode } from './node-handlers';
import { repository } from '@/repository';
import { createLogger } from '@/core/utils/debug/logger';

const logger = createLogger('step-machine');

type StepMachineContext = {
  tNodeId?: EARS.EntityId;
  tNode: TNodeEntity;
  step: NodeEntity;
  eventTNodeId?: EARS.EntityId;
};

type StepEvent = {
  type: 'CANCEL' | 'COMPLETE' | 'ERROR';
  result?: any;
  error?: any;
};

type StepMachineInput = {};

/**
 * Create a step execution machine
 */
export function createStepNodeSystem(
  stepId: EARS.EntityId,
  eventTNodeId: EARS.EntityId,
  executionContext = {} as ExecutionContext,
  systemActor?: any,
) {
  const result = repository.brainCommands.createStepTNode(stepId, eventTNodeId, executionContext, systemActor);
  if (!result.success) {
    throw new Error(`Failed to create step TNode: ${result.error}`);
  }
  const { tNode, step } = result.data;
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

          // Delegate to step executor with TNode
          executeNode(context.tNode, context.step, executionContext, self);
        },
        markCompleted: ({ context, self }) => {
          if (context.tNodeId) {
            repository.brainCommands.updateTNodeStatus(context.tNodeId, 'completed', context.eventTNodeId, self);
          }
        },
        markFailed: ({ context, self }) => {
          if (context.tNodeId) {
            repository.brainCommands.updateTNodeStatus(context.tNodeId, 'failed', context.eventTNodeId, self);
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
          isFlow: false,
        })),
      },
    }).createMachine({
      id: `step-machine`,
      initial: 'executing',
      context: ({ input }) => ({
        tNodeId: tNode.id,
        tNode: tNode,
        step: step,
        eventTNodeId: eventTNodeId,
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
