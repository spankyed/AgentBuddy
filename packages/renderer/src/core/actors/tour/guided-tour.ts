import { setup, assign, sendParent, fromCallback, emit, sendTo } from 'xstate';
import { trpc } from '@/core/trpc';
import { tourSteps, type TourStep } from './tour-steps-simple';

interface Context {
  currentStepIndex: number;
  steps: TourStep[];
}

type Event =
  | { type: 'NEXT' }
  | { type: 'PREVIOUS' }
  | { type: 'END' }
  | { type: 'COMPLETE' }
  | { type: 'STEP_ACTION_COMPLETED' };

export const guidedTourMachine = setup({
  types: {
    context: {} as Context,
    events: {} as Event,
  },
  actions: {
    incrementStep: assign({
      currentStepIndex: ({ context }) => Math.min(context.currentStepIndex + 1, context.steps.length - 1),
    }),
    decrementStep: assign({
      currentStepIndex: ({ context }) => Math.max(context.currentStepIndex - 1, 0),
    }),
    executeSetupActions: ({ context, self }) => {
      const currentStep = context.steps[context.currentStepIndex];
      
      if (currentStep.setupActions && currentStep.setupActions.length > 0) {
        currentStep.setupActions.forEach(action => {
          self._parent?.send({
            type: 'ROUTE_TOUR_EVENT',
            target: action.target,
            event: action.event
          });
        });
      }
    },
    completeTour: () => {
      // Send event to backend to complete the tour
      // Backend will handle setting tourStarted to false and showing all plugins
      trpc.bus.send.mutate({
        systemId: 'settings',
        type: 'COMPLETE_ONBOARDING'
      });
    },
  },
}).createMachine({
  id: 'guidedTour',
  initial: 'touring',
  context: {
    currentStepIndex: 0,
    steps: tourSteps,
  },
  states: {
    touring: {
      entry: ['executeSetupActions'],
      on: {
        NEXT: {
          actions: ['incrementStep', 'executeSetupActions'],
        },
        PREVIOUS: {
          actions: ['decrementStep', 'executeSetupActions'],
        },
        END: {
          target: 'ended',
          actions: 'completeTour',
        },
        COMPLETE: {
          target: 'completed',
          actions: 'completeTour',
        },
      },
    },
    ended: {
      type: 'final',
      entry: sendParent({ type: 'TOUR_ABORTED' }),
    },
    completed: {
      type: 'final',
    },
  },
});