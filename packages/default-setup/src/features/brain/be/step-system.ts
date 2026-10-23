import { defineHandlers } from '@apackdev/sdk/framework';
import { setup, assign, sendParent, enqueueActions, type AnyActorRef } from 'xstate';
import { EARS } from '#generated/ears.ts';
import type { ExecutionContext, RunNodeId, StepInput } from '@apackdev/sdk/steps';
import type { NodeEntity } from '#generated/types.ts';
import { executeNode } from './node-handlers/index.ts';
import { repository } from '#generated/repository.ts';
import { services } from '#generated/services.ts';
import { errorMessage } from '@apackdev/sdk/utils/pure';

type StepMachineContext = {
  runNodeId?: RunNodeId;
  /** What the step runs on, whole: its run node holds only a bounded copy */
  input: StepInput;
  step: NodeEntity;
  eventRunNodeId?: RunNodeId;
  error?: any;
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

/** Hands each handler the answer for the message it is handling — see `defineHandlers` */
const handlers = defineHandlers<StepMachineContext, StepEvent>();
export function createStepNodeSystem(
  brain: AnyActorRef,
  stepId: EARS.EntityId,
  eventRunNodeId: RunNodeId,
  executionContext = {} as ExecutionContext,
  parentRunNodeId?: RunNodeId,
) {
  const { runNode, step, input } = repository.brainCommands.createStepRunNode(stepId, parentRunNodeId ?? eventRunNodeId, executionContext);
  return {
    runNodeId: runNode.id,
    runNode: runNode,
    machine: setup({
      types: {
        context: {} as StepMachineContext,
        events: {} as StepEvent,
        input: {} as StepMachineInput,
      },
      actions: handlers.actions({
        executeStep: ({ context, self }) => {
          try {
            // brainLogger.debug(
            //   `Executing step: ${context.step.label} (${context.step.nodeType})`,
            // );

            executeNode(context.input, context.step, executionContext, self);
          } catch (error) {
            self.send({ type: 'ERROR', error: errorMessage(error) });
          }
        },
        storeResult: ({ context, event }) => {
          if (context.runNodeId && event.type === 'COMPLETE' && event.result !== undefined) {
            // The run history bounds what it stores
            services.runHistory.update(context.runNodeId, { result: event.result });
          }
        },
        markCompleted: enqueueActions(({ context, enqueue }) => {
          if (context.runNodeId) {
            services.runHistory.finish(context.runNodeId, 'completed');
            
            // Straight to the brain, as flows send theirs: a parent flow finishing on this step's completion
            // stops before a forwarded update would reach it
            const runNodeId = context.runNodeId;
            const eventRunNodeId = context.eventRunNodeId;
            enqueue(() => {
              brain.send({ type: 'RUN_NODE_UPDATED', data: { runNodeId, status: 'completed', eventRunNodeId } });
            });
          }
        }),
        markFailed: enqueueActions(({ context, enqueue }) => {
          if (context.runNodeId) {
            services.runHistory.finish(context.runNodeId, 'failed');
            
            // Straight to the brain, as flows send theirs: a parent flow finishing on this step's completion
            // stops before a forwarded update would reach it
            const runNodeId = context.runNodeId;
            const eventRunNodeId = context.eventRunNodeId;
            enqueue(() => {
              brain.send({ type: 'RUN_NODE_UPDATED', data: { runNodeId, status: 'failed', eventRunNodeId } });
            });
          }
        }),
        storeErrorResult: ({ context }) => {
          if (context.runNodeId && context.error !== undefined) {
            services.runHistory.update(context.runNodeId, { result: { error: context.error } });
          }
        },
        notifyComplete: sendParent(({ context, event }) => ({
          type: 'CHILD_COMPLETED',
          stepId: context.step.id,
          stepLabel: context.step.label,
          runNodeId: context.runNodeId,
          result: event.result,
          final: context.step.final || false,
          eventRunNodeId: context.eventRunNodeId,
          isFlow: false,
        })),
        notifyFailed: sendParent(({ context }) => ({
          type: 'CHILD_COMPLETED',
          stepId: context.step.id,
          stepLabel: context.step.label,
          runNodeId: context.runNodeId,
          result: { error: context.error },
          failed: true,
          final: false,
          eventRunNodeId: context.eventRunNodeId,
          isFlow: false,
        })),
      }),
    }).createMachine({
      id: `step-machine`,
      initial: 'executing',
      context: () => ({
        runNodeId: runNode.id,
        input,
        step: step,
        eventRunNodeId: eventRunNodeId,
      }),
      states: {
        executing: {
          entry: 'executeStep',
          on: {
            COMPLETE: {
              target: 'completed',
              actions: ['storeResult', 'notifyComplete'],
            },
            ERROR: {
              target: 'failed',
              actions: assign({ error: ({ event }) => event.error }),
            },
          },
        },
        completed: {
          entry: ['markCompleted'],
          type: 'final',
        },
        failed: {
          entry: ['storeErrorResult', 'markFailed', 'notifyFailed'],
          type: 'final',
        },
      },
    })
  }
}
