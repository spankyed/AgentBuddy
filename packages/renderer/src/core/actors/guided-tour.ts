import { setup, assign, sendParent, fromCallback, emit, sendTo } from 'xstate';
import { trpc } from '@/core/trpc';
import { tourSteps, type TourStep } from './tour-steps';

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
      console.log('[Tour] Executing setup actions for:', currentStep.id);
      
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
      // Same as endTour - mark tour as not started and show all plugins
      trpc.bus.send.mutate({
        systemId: 'settings',
        type: 'UPDATE_SETTINGS',
        entityType: 'internal',
        label: 'internal',
        path: ['tourStarted'],
        value: false,
      });
      
      // Show all plugins
      const allPlugins = ['threads', 'agent', 'code', 'library', 'actions', 'prompts', 'flows', 'brain', 'database', 'logs', 'blank'];
      const visibilityUpdate: Record<string, boolean> = {};
      allPlugins.forEach(plugin => {
        visibilityUpdate[plugin] = true;
      });
      visibilityUpdate['settings'] = true; // Settings should always be visible
      
      trpc.bus.send.mutate({
        systemId: 'settings',
        type: 'UPDATE_SETTINGS',
        entityType: 'plugin',
        label: '_meta',
        path: ['visibility'],
        value: visibilityUpdate,
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
      entry: sendParent({ type: 'TOUR_ENDED' }),
    },
    completed: {
      type: 'final',
      entry: sendParent({ type: 'TOUR_COMPLETED' }),
    },
  },
});