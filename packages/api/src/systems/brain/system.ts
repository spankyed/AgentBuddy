import { assign, cancel, fromPromise, log, raise, sendTo, setup, type ErrorActorEvent, type ActorRefFrom, enqueueActions } from 'xstate';
import type { MergeReceivable } from '@/core/utils/event-helpers';
import { fromSystem, systemBus } from '@/core/utils/event-helpers';
import { bus, SystemEvents } from '@/systems/backend';
import { emit, getActor, safeEvents, sendParentSafe } from '@/core/utils/actor-helpers';
// import { addMessageToLatestThread, getLatestMessage } from './accessors';
import { EARS } from '@/core/types';
import { z } from 'zod';
import type { FlowTNodeData, TNodeEntity, TNodeUpdate, EventReceived } from './types';
import { repository } from '@/repository';
import { createFlowNodeSystem } from './flow-system';
import { agent } from '../agent/system';
import { database } from '../database/system';

const eventsCatalog = {
  'user.message': z.object({
    text: z.string(),
  }),
}

const typeOf = safeEvents<ReceivableEvents>();

export const brain = 'brain' as const;
export const brainBus = 'brain-bus' as const;

const busEvent = systemBus(brain);

export const IncomingBrainEvents = [
  busEvent('OPEN_TNODE', { tNodeId: z.string() }),
  busEvent('GO_BACK_TNODE', {}),
  busEvent('REQUEST_PLUGIN_DATA', {}),
] as const

export type BrainInternalEvents = 
  | SystemEvents
  // | { type: 'TRACE_EVENT_RECEIVED'; data: EventReceived }
  | { type: 'TRIGGER_BRAIN_EVENT'; eventType: string; payload?: any }
  | { type: 'TNODE_SPAWNED'; tNode: TNodeEntity; parentId?: EARS.EntityId; eventTNodeId?: EARS.EntityId; flowTNodeId: EARS.EntityId }
  | { type: 'TNODE_UPDATED'; data: TNodeUpdate }

export type OutgoingBrainEvents =
  | { type: 'RECEIVE_PLUGIN_DATA'; data: FlowTNodeData }
  // | { type: 'BRAIN_STARTUP'; data: FlowTNodeData }
  | { type: 'TNODE_OPENED'; tNodeId: EARS.EntityId; data: FlowTNodeData }
  | { type: 'TNODE_SPAWNED'; tNode: TNodeEntity; parentId?: EARS.EntityId; eventTNodeId?: EARS.EntityId; flowTNodeId: EARS.EntityId }
  | { type: 'TNODE_UPDATED'; data: TNodeUpdate }
  | { type: 'EVENT_PULSE'; eventType: string }

export const BrainSystemEvents = fromSystem(IncomingBrainEvents)<OutgoingBrainEvents, typeof brain>()
type ReceivableEvents = MergeReceivable<typeof IncomingBrainEvents, BrainInternalEvents>;

export const brainSystem = setup({
  types: {
    context: {} as {},
    events: {} as ReceivableEvents,
  },
  actions: {
    logError: ({ event }) => {
      // console.error('Brain system error:', typeOf('ERROR', event).error);
    },
    startBrain: enqueueActions(({ system, context, enqueue, self }) => {
      const { machine, tNodeId } = createFlowNodeSystem(undefined, undefined, undefined)
      enqueue.spawnChild(machine, {
        systemId: brainBus, // aka root flow
        input: {}
      });
    }),
    sendPluginData: ({ system, context, self }) => {
      const data = repository.brainQueries.rootData();
      
      system.get(bus).send(emit(brain, { 
        type: 'RECEIVE_PLUGIN_DATA',
        data
      }));
    },
    openTNode: ({ system, event, context }) => {
      const ev = typeOf('OPEN_TNODE', event);
      const tNodeId = ev.tNodeId as EARS.EntityId;
      const data = repository.brainQueries.extendedTNodeData(tNodeId);
      
      system.get(bus).send(emit(brain, {
        type: 'TNODE_OPENED',
        tNodeId,
        data
      }));
    },
    goBackTNode: ({ system, context }) => {
      const data = repository.brainQueries.rootData();
      
      system.get(bus).send(emit(brain, {
        type: 'TNODE_OPENED',
        tNodeId: data.flowTNodeId,
        data
      }));
    },
    triggerBrainEvent: ({ system, event, context }) => {
      const ev = typeOf('TRIGGER_BRAIN_EVENT', event);
      const { eventType, payload } = ev;
      // const brainActor = getActor(system, brainBus);
      const brainActor = system.get(brainBus);

      // Pulse the event in UI
      system.get(bus).send(emit(brain, {
        type: 'EVENT_PULSE',
        eventType: eventType
      }));

      if (brainActor && brainActor.send) {
        brainActor.send({
          type: eventType,
          payload
        });
      } else {
        console.error(`Brain actor is not available or has terminated. Cannot send event: ${eventType}`);
      }
    },
    // handleEventReceived: ({ system, event, context }) => {
    //   if (event.type === 'TRACE_EVENT_RECEIVED') {
    //     // Pulse the event in UI
    //     system.get(bus).send(emit(brain, {
    //       type: 'EVENT_PULSE',
    //       eventType: event.data.eventType
    //     }));

    //     // Forward event to brain runner
    //     system.get(brainBus).send({
    //       type: event.data.eventType,
    //       payload: event.data.payload
    //     });
    //   }
    // },
  },
}).createMachine(
  {
    id: brain,
    initial: 'idle',
    context: ({ input }) => ({}),
    on: {},
    states: {
      idle: {
        on: {
          CLIENT_CONNECTED: {
            actions: ['sendPluginData'],
            target: 'running',
          },
        },
      },
      running: {
        entry: ['startBrain'],
        on: {
          CLIENT_CONNECTED: {
            actions: 'sendPluginData',
          },
          REQUEST_PLUGIN_DATA: {
            actions: 'sendPluginData',
          },
          ERROR: {
            actions: 'logError',
          },
          OPEN_TNODE: {
            actions: 'openTNode',
          },
          GO_BACK_TNODE: {
            actions: 'goBackTNode',
          },
          // TRACE_EVENT_RECEIVED: {
          //   actions: 'handleEventReceived',
          // },
          TRIGGER_BRAIN_EVENT: {
            actions: 'triggerBrainEvent',
          },
          TNODE_SPAWNED: {
            actions: ({ system, event }) => {
              // Forward to frontend
              system.get(bus).send(emit(brain, event));
            }
          },
          TNODE_UPDATED: {
            actions: ({ system, event }) => {
              // Forward to frontend
              system.get(bus).send(emit(brain, event));
            }
          },
        },
      }
    },
  }
);
