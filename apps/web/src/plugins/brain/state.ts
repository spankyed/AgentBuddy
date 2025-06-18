import { assign, setup, type ActorRefFrom } from 'xstate';
import { safeEvents } from '@/core/types/safe-events';
import type {
  OutgoingBrainEvents,
} from '@abuddy/api'
import type { TrackEntity, EventListenerEntity, BrainStartupData } from '@abuddy/api';
import { trpc } from '@/core/trpc';

export const id = 'brain';
export type BrainState = ActorRefFrom<typeof brainState>

export interface BrainContext {
  rootFlowId?: string;
  currentFlowId?: string;
  flowStack: string[];
  tracks: TrackEntity[];
  possibleEvents: EventListenerEntity[];
  flowLabel?: string;
  pulsingEventTag?: string;
}

type SystemEvent = OutgoingBrainEvents

type UIEvent =
  | { type: 'TRACK.CLICK'; trackId: string }
  | { type: 'FLOW_NODE.CLICK'; flowId: string }
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
        rootFlowId: event.data.rootFlowId,
        currentFlowId: event.data.currentFlowId,
        flowStack: event.data.flowStack,
        tracks: event.data.tracks,
        possibleEvents: event.data.possibleEvents,
        flowLabel: event.data.rootFlow?.label
      };
    }),
    setSubFlowData: assign(({ event }) => {
      if (event.type !== 'SUB_FLOW_OPENED') return {};
      return {
        currentFlowId: event.data.currentFlowId,
        flowStack: event.data.flowStack,
        tracks: event.data.tracks,
        possibleEvents: event.data.possibleEvents,
      };
    }),
    addTrack: assign(({ context, event }) => {
      if (event.type !== 'TRACK_SPAWNED') return {};
      return {
        tracks: [...context.tracks, event.track]
      };
    }),
    updateTrack: assign(({ context, event }) => {
      if (event.type !== 'TRACK_UPDATED') return {};
      return {
        tracks: context.tracks.map(track =>
          track.id === event.data.trackId
            ? { ...track, currentNodeId: event.data.nodeId, status: event.data.status }
            : track
        )
      };
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
    openSubFlow: ({ event }) => {
      let flowId: string;
      
      if (event.type === 'TRACK.CLICK') {
        flowId = event.trackId; // In real impl, get flowId from track
      } else if (event.type === 'FLOW_NODE.CLICK') {
        flowId = event.flowId;
      } else {
        return;
      }
      
      trpc.bus.send.mutate({
        systemId: id,
        type: 'OPEN_SUB_FLOW',
        flowId
      });
    },
    goBack: () => {
      trpc.bus.send.mutate({
        systemId: id,
        type: 'GO_BACK_FLOW'
      });
    },
    spawnTrack: ({ event, context }) => {
      const ev = typeOf('EVENT.CLICK', event);
      
      trpc.bus.send.mutate({
        systemId: id,
        type: 'SPAWN_TRACK',
        eventTag: ev.eventTag,
        flowId: context.currentFlowId!
      });
    },
  },
  guards: {
    hasFlowInTrack: ({ event }) => {
      // In real implementation, check if track has a flow node
      return event.type === 'TRACK.CLICK' && event.trackId === 'Track-G7H8I9';
    },
    canGoBack: ({ context }) => {
      return context.flowStack.length > 1;
    }
  },
}).createMachine({
  id,
  context: {
    flowStack: [],
    tracks: [],
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
        'TRACK.CLICK': {
          guard: 'hasFlowInTrack',
          actions: 'openSubFlow'
        },
        'FLOW_NODE.CLICK': {
          actions: 'openSubFlow'
        },
        'BACK.CLICK': {
          guard: 'canGoBack',
          actions: 'goBack'
        },
        'EVENT.CLICK': {
          actions: 'spawnTrack'
        },
        SUB_FLOW_OPENED: {
          actions: 'setSubFlowData'
        },
        TRACK_SPAWNED: {
          actions: 'addTrack'
        },
        TRACK_UPDATED: {
          actions: 'updateTrack'
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