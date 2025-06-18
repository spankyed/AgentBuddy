import { assign, cancel, fromPromise, log, raise, sendTo, setup, type ErrorActorEvent } from 'xstate';
import type { MergeReceivable } from '@/shared/utils/event-helpers';
import { fromSystem, systemBus } from '@/shared/utils/event-helpers';
import { bus, SystemEvents } from '@/systems/_backend/backend';
import { emit, getActor, safeEvents, sendParentSafe } from '@/shared/utils/actor-helpers';
// import { addMessageToLatestThread, getLatestMessage } from './accessors';
import { EARS } from '@/shared/ears/types';
import { z } from 'zod';
import type { BrainStartupData, TrackEntity, TrackUpdate, EventReceived } from './types';
import brainStartupData from './repository/startup';

const typeOf = safeEvents<ReceivableEvents>();

export const brain = 'brain' as const;

const busEvent = systemBus(brain);

export const IncomingBrainEvents = [
  busEvent('OPEN_SUB_FLOW', { flowId: z.string() }),
  busEvent('GO_BACK_FLOW', {}),
  busEvent('SPAWN_TRACK', { eventTag: z.string(), flowId: z.string() }),
] as const

export type BrainInternalEvents = 
  | SystemEvents
  | { type: 'TRACK_UPDATE'; data: TrackUpdate }
  | { type: 'EVENT_RECEIVED'; data: EventReceived }

export type OutgoingBrainEvents =
  | { type: 'BRAIN_STARTUP'; data: BrainStartupData }
  | { type: 'SUB_FLOW_OPENED'; flowId: EARS.EntityId; data: BrainStartupData }
  | { type: 'TRACK_SPAWNED'; track: TrackEntity }
  | { type: 'TRACK_UPDATED'; data: TrackUpdate }
  | { type: 'EVENT_PULSE'; eventTag: string }

export const BrainSystemEvents = fromSystem(IncomingBrainEvents)<OutgoingBrainEvents, typeof brain>()
type ReceivableEvents = MergeReceivable<typeof IncomingBrainEvents, BrainInternalEvents>;

export const brainSystem = setup({
  types: {
    context: {} as {
      brainId: EARS.EntityId;
      flowStack: EARS.EntityId[];
      currentFlowId: EARS.EntityId;
      rootFlowId: EARS.EntityId;
    },
    events: {} as ReceivableEvents,
    input: {} as EARS.EntityId,
  },
  actions: {
    logError: (_, event: ErrorActorEvent<unknown, string>) => {
      console.error('Brain system error:', event.error);
    },
    sendBrainStartupData: ({ system, context }) => {
      console.log('Sending brain startup data');
      const data = brainStartupData(context.rootFlowId);
      
      system.get(bus).send(emit(brain, { 
        type: 'BRAIN_STARTUP',
        data
      }));
    },
    updateFlowStack: assign({
      flowStack: ({ context, event }) => {
        const ev = typeOf('OPEN_SUB_FLOW', event);
        return [...context.flowStack, ev.flowId as EARS.EntityId];
      },
      currentFlowId: ({ event }) => {
        const ev = typeOf('OPEN_SUB_FLOW', event);
        return ev.flowId as EARS.EntityId;
      }
    }),
    openSubFlow: ({ system, event, context }) => {
      const ev = typeOf('OPEN_SUB_FLOW', event);
      const flowId = ev.flowId as EARS.EntityId;
      
      // Get sub-flow data
      const data = brainStartupData(flowId);
      
      system.get(bus).send(emit(brain, {
        type: 'SUB_FLOW_OPENED',
        flowId,
        data
      }));
    },
    updateFlowStackBack: assign({
      flowStack: ({ context }) => context.flowStack.slice(0, -1),
      currentFlowId: ({ context }) => {
        const newStack = context.flowStack.slice(0, -1);
        return newStack[newStack.length - 1];
      }
    }),
    goBackFlow: ({ system, context }) => {
      if (context.flowStack.length > 1) {
        const previousFlowId = context.flowStack[context.flowStack.length - 2];
        const data = brainStartupData(previousFlowId);
        
        system.get(bus).send(emit(brain, {
          type: 'SUB_FLOW_OPENED',
          flowId: previousFlowId,
          data
        }));
      }
    },
    spawnTrack: ({ system, event }) => {
      const ev = typeOf('SPAWN_TRACK', event);
      
      // Create new track entity (in real implementation, this would be persisted)
      const newTrack: TrackEntity = {
        id: `Track-${Date.now()}` as EARS.EntityId,
        entityType: EARS.Entity.Track,
        flowId: ev.flowId as EARS.EntityId,
        eventTag: ev.eventTag,
        eventLabel: ev.eventTag, // In real impl, resolve from event registry
        status: 'active',
        createdAt: Date.now(),
        startedAt: Date.now(),
        nodes: []
      };
      
      system.get(bus).send(emit(brain, {
        type: 'TRACK_SPAWNED',
        track: newTrack
      }));
    },
    handleTrackUpdate: ({ system, event }) => {
      if (event.type === 'TRACK_UPDATE') {
        system.get(bus).send(emit(brain, {
          type: 'TRACK_UPDATED',
          data: event.data
        }));
      }
    },
    handleEventReceived: ({ system, event }) => {
      if (event.type === 'EVENT_RECEIVED') {
        // Pulse the event in UI
        system.get(bus).send(emit(brain, {
          type: 'EVENT_PULSE',
          eventTag: event.data.eventTag
        }));
        
        // Auto-spawn track for the event
        const newTrack: TrackEntity = {
          id: `Track-${Date.now()}` as EARS.EntityId,
          entityType: EARS.Entity.Track,
          flowId: event.data.flowId,
          eventTag: event.data.eventTag,
          eventLabel: event.data.eventTag,
          status: 'active',
          startedAt: Date.now(),
          createdAt: Date.now(),
          nodes: []
        };
        
        system.get(bus).send(emit(brain, {
          type: 'TRACK_SPAWNED',
          track: newTrack
        }));
      }
    }
  },
}).createMachine(
  {
    id: brain,
    initial: 'idle',
    context: ({ input }) => ({
      brainId: input,
      flowStack: ['Flow-2'] as EARS.EntityId[], // Start with root flow
      currentFlowId: 'Flow-2' as EARS.EntityId,
      rootFlowId: 'Flow-2' as EARS.EntityId,
    }),
    on: {
      OPEN_SUB_FLOW: {
        actions: ['updateFlowStack', 'openSubFlow'],
      },
      GO_BACK_FLOW: {
        actions: ['updateFlowStackBack', 'goBackFlow'],
      },
      SPAWN_TRACK: {
        actions: 'spawnTrack',
      },
      TRACK_UPDATE: {
        actions: 'handleTrackUpdate',
      },
      EVENT_RECEIVED: {
        actions: 'handleEventReceived',
      }
    },
    states: {
      idle: {
        on: {
          CLIENT_CONNECTED: {
            actions: 'sendBrainStartupData',
          },
        },
      },
    },
  }
);
