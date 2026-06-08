import { setup, assign, sendParent, enqueueActions } from 'xstate';
import { NodeEntity, EARS, ExecutionContext, TNodeEntity } from '@/types';
import { executeNode } from './node-handlers';
import { repository } from '@/repository';
import { brainInspect } from './utils/brain-inspect';

type StepMachineContext = {
  tNodeId?: EARS.EntityId;
  tNode: TNodeEntity;
  step: NodeEntity;
  eventTNodeId?: EARS.EntityId;
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
export function createStepNodeSystem(
  stepId: EARS.EntityId,
  eventTNodeId: EARS.EntityId,
  executionContext = {} as ExecutionContext,
  parentTNodeId?: EARS.EntityId,
) {
  const { tNode, step } = repository.brainCommands.createStepTNode(stepId, parentTNodeId ?? eventTNodeId, executionContext);
  return {
    tNodeId: tNode.id,
    tNode: tNode,
    machine: setup({
      types: {
        context: {} as StepMachineContext,
        events: {} as StepEvent,
        input: {} as StepMachineInput,
      },
      actions: {
        executeStep: ({ context, self }) => {
          try {
            // brainInspect(
            //   `Executing step: ${context.step.label} (${context.step.nodeType})`,
            // );

            // Delegate to step executor with TNode
            executeNode(context.tNode, context.step, executionContext, self);
          } catch (error) {
            self.send({ type: 'ERROR', error: error instanceof Error ? error.message : String(error) });
          }
        },
        storeResult: ({ context, event }) => {
          if (context.tNodeId && event.type === 'COMPLETE' && event.result !== undefined) {
            // Result truncation is handled in updateTNodeResult to prevent memory overflow
            repository.brainCommands.updateTNodeResult(context.tNodeId, event.result);
          }
        },
        markCompleted: enqueueActions(({ context, enqueue }) => {
          if (context.tNodeId) {
            // Update status
            repository.brainCommands.updateTNodeStatus(context.tNodeId, 'completed');
            
            // Send TNODE_UPDATED event to parent
            enqueue.sendParent({
              type: 'TNODE_UPDATED',
              data: { 
                tNodeId: context.tNodeId, 
                status: 'completed', 
                eventTNodeId: context.eventTNodeId 
              }
            });
          }
        }),
        markFailed: enqueueActions(({ context, enqueue }) => {
          if (context.tNodeId) {
            repository.brainCommands.updateTNodeStatus(context.tNodeId, 'failed');
            
            // Send TNODE_UPDATED event to parent
            enqueue.sendParent({
              type: 'TNODE_UPDATED',
              data: { 
                tNodeId: context.tNodeId, 
                status: 'failed', 
                eventTNodeId: context.eventTNodeId 
              }
            });
          }
        }),
        storeErrorResult: ({ context }) => {
          if (context.tNodeId && context.error !== undefined) {
            repository.brainCommands.updateTNodeResult(context.tNodeId, {
              error: context.error,
            });
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
        notifyFailed: sendParent(({ context }) => ({
          type: 'CHILD_COMPLETED',
          stepId: context.step.id,
          stepLabel: context.step.label,
          tNodeId: context.tNodeId,
          result: { error: context.error },
          failed: true,
          final: false,
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
