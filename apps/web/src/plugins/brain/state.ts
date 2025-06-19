import { assign, setup, type ActorRefFrom } from 'xstate';
import { safeEvents } from '@/core/types/safe-events';
import type {
  OutgoingBrainEvents,
} from '@abuddy/api'
import type { TNodeEntity, EventListenerEntity, FlowTNodeData, TrackEntity } from '@abuddy/api';
import { trpc } from '@/core/trpc';

export const id = 'brain';
export type BrainState = ActorRefFrom<typeof brainState>

export interface BrainContext {
  flowTNodeId?: string;
  tNodeTree?: TrackEntity[];
  possibleEvents: EventListenerEntity[];
  pulsingEventTag?: string;
}

type SystemEvent = OutgoingBrainEvents

type UIEvent =
  | { type: 'TNODE.CLICK'; tNodeId: string }
  | { type: 'BACK.CLICK' }
  | { type: 'EVENT.CLICK'; eventTag: string }

export type BrainEvents = UIEvent | SystemEvent
const typeOf = safeEvents<BrainEvents>()

const brainState = setup({
  types: {
    context: {} as BrainContext,
    events: {} as BrainEvents,
  },
  actors: {},
  actions: {
    setBrainData: assign(({ event }) => {
      if (event.type !== 'BRAIN_STARTUP') return {};
      return {
        flowTNodeId: event.data.flowTNodeId,
        tNodeTree: event.data.tNodeTree,
        possibleEvents: event.data.possibleEvents,
      };
    }),
    setTNodeData: assign(({ event }) => {
      if (event.type !== 'TNODE_OPENED') return {};
      return {
        flowTNodeId: event.data.flowTNodeId,
        tNodeTree: event.data.tNodeTree,
        possibleEvents: event.data.possibleEvents,
      };
    }),
    addEventTNode: assign(({ context, event }) => {
      if (event.type !== 'EVENT_TNODE_SPAWNED') return {};
      // TODO: Update tNodeTree to include new event node
      return {};
    }),
    updateTNode: assign(({ context, event }) => {
      if (event.type !== 'TNODE_UPDATED') return {};
      // TODO: Update tNodeTree with new status
      return {};
    }),
    pulseEvent: assign(({ event }) => {
      if (event.type !== 'EVENT_PULSE') return {};
      return {
        pulsingEventTag: event.eventTag
      };
    }),
    clearPulse: assign({
      pulsingEventTag: undefined
    }),
    openTNode: ({ event }) => {
      let tNodeId: string;
      
      if (event.type === 'TNODE.CLICK') {
        tNodeId = event.tNodeId;
      } else {
        return;
      }
      
      trpc.bus.send.mutate({
        systemId: id,
        type: 'OPEN_TNODE',
        tNodeId
      });
    },
    goBack: () => {
      trpc.bus.send.mutate({
        systemId: id,
        type: 'GO_BACK_TNODE'
      });
    },
  },
  guards: {
    canGoBack: ({ context }) => {
      return true;
    }
  },
}).createMachine({
  id,
  context: {
    possibleEvents: [],
  },
  initial: 'loading',
  states: {
    loading: {
      on: {
        BRAIN_STARTUP: {
          target: 'ready',
          actions: 'setBrainData'
        }
      }
    },
    ready: {
      on: {
        'TNODE.CLICK': {
          actions: 'openTNode'
        },
        'BACK.CLICK': {
          guard: 'canGoBack',
          actions: 'goBack'
        },
        'EVENT.CLICK': {
        },
        TNODE_OPENED: {
          actions: 'setTNodeData'
        },
        EVENT_TNODE_SPAWNED: {
          actions: 'addEventTNode'
        },
        TNODE_UPDATED: {
          actions: 'updateTNode'
        },
        EVENT_PULSE: {
          actions: ['pulseEvent', ({ system }) => {
            // Clear pulse after animation
            setTimeout(() => {
              system.get(id).send({ type: 'CLEAR_PULSE' as any });
            }, 400);
          }]
        },
        CLEAR_PULSE: {
          actions: 'clearPulse'
        }
      }
    }
  },
});

export default brainState;