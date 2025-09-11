import { setup, assign, sendParent, fromCallback, emit, sendTo, type SnapshotFrom } from 'xstate';
import { trpc } from '@/core/trpc';
import { tourSteps, type TourStep } from './tour-steps';

export type GuidedTourState = SnapshotFrom<typeof guidedTourMachine>

interface Context {
  currentStepIndex: number;
  steps: TourStep[];
  isAutoPlaying: boolean;
}

type Event =
  | { type: 'NEXT' }
  | { type: 'PREVIOUS' }
  | { type: 'END' }
  | { type: 'COMPLETE' }
  | { type: 'STEP_ACTION_COMPLETED' }
  | { type: 'AUTO_PLAY' }
  | { type: 'STOP_AUTO_PLAY' }
  | { type: 'AUTO_NEXT' };

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
    startAutoPlay: assign({
      isAutoPlaying: true,
    }),
    stopAutoPlay: assign({
      isAutoPlaying: false,
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
  delays: {
    stepTimeout: ({ context }) => {
      const currentStep = context.steps[context.currentStepIndex];
      return currentStep.timeout || 5000;
    },
  },
}).createMachine({
  id: 'guidedTour',
  initial: 'touring',
  context: {
    currentStepIndex: 0,
    steps: tourSteps,
    isAutoPlaying: false,
  },
  states: {
    touring: {
      initial: 'manual',
      entry: ['executeSetupActions'],
      states: {
        manual: {
          on: {
            AUTO_PLAY: [
              {
                // If on welcome step (index 0), immediately go to step 1
                guard: ({ context }) => context.currentStepIndex === 0,
                target: 'autoPlaying',
                actions: ['incrementStep', 'executeSetupActions', 'startAutoPlay'],
              },
              {
                // Otherwise, start auto-play normally
                target: 'autoPlaying',
                actions: 'startAutoPlay',
              },
            ],
          },
        },
        autoPlaying: {
          after: {
            stepTimeout: {
              target: 'autoPlayingNext',
            },
          },
          on: {
            STOP_AUTO_PLAY: {
              target: 'manual',
              actions: 'stopAutoPlay',
            },
          },
        },
        autoPlayingNext: {
          // Transient state to force re-entry into autoPlaying
          always: [
            {
              guard: ({ context }) => context.currentStepIndex < context.steps.length - 1,
              target: 'autoPlaying',
              actions: ['incrementStep', 'executeSetupActions'],
            },
            {
              // Last step reached
              target: '#guidedTour.completed',
              actions: 'completeTour',
            },
          ],
        },
      },
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