import { assign, cancel, fromPromise, log, raise, sendTo, setup, type ErrorActorEvent, type ActorRefFrom, enqueueActions } from 'xstate';
import type { MergeReceivable } from '@/shared/utils/event-helpers';
import { fromSystem, systemBus } from '@/shared/utils/event-helpers';
import { bus, SystemEvents } from '@/systems/_backend/backend';
import { emit, getActor, safeEvents, sendParentSafe } from '@/shared/utils/actor-helpers';
// import { addMessageToLatestThread, getLatestMessage } from './accessors';
import { EARS } from '@/shared/ears/types';
import { z } from 'zod';
import type { FlowTNodeData, TNodeEntity, TNodeUpdate, EventReceived } from './types';
import getStartupData, { getExtendedTNodeData } from './repository/startup';
import { createFlowMachine } from './runner/machines/flow-machine';

const typeOf = safeEvents<ReceivableEvents>();

export const brain = 'brain' as const;
export const brainBus = 'brain-bus' as const;

const busEvent = systemBus(brain);

export const IncomingBrainEvents = [
  busEvent('OPEN_TNODE', { tNodeId: z.string() }),
  busEvent('GO_BACK_TNODE', {}),
] as const

export type BrainInternalEvents = 
  | SystemEvents
  | { type: 'TRACE_EVENT_RECEIVED'; data: EventReceived }

export type OutgoingBrainEvents =
  | { type: 'BRAIN_STARTUP'; data: FlowTNodeData }
  | { type: 'TNODE_OPENED'; tNodeId: EARS.EntityId; data: FlowTNodeData }
  | { type: 'EVENT_TNODE_SPAWNED'; tNode: TNodeEntity }
  | { type: 'TNODE_UPDATED'; data: TNodeUpdate }
  | { type: 'EVENT_PULSE'; eventType: string }

export const BrainSystemEvents = fromSystem(IncomingBrainEvents)<OutgoingBrainEvents, typeof brain>()
type ReceivableEvents = MergeReceivable<typeof IncomingBrainEvents, BrainInternalEvents>;

export const brainSystem = setup({
  types: {
    context: {} as {
      brainId: EARS.EntityId;
    },
    events: {} as ReceivableEvents,
    input: {} as EARS.EntityId,
  },
  actions: {
    logError: ({ event }) => {
      // console.error('Brain system error:', typeOf('ERROR', event).error);
    },
    startBrain: enqueueActions(({ system, context, enqueue, self }) => {
      const { machine, tNodeId } = createFlowMachine()
      enqueue.spawnChild(machine, {
        systemId: brainBus,
        input: {
          executionContext: {},
          systemActor: self,
        }
      });
    }),
    sendFlowTNodeData: ({ system, context, self }) => {
      const data = getStartupData();
      
      system.get(bus).send(emit(brain, { 
        type: 'BRAIN_STARTUP',
        data
      }));
    },
    openTNode: ({ system, event, context }) => {
      const ev = typeOf('OPEN_TNODE', event);
      const tNodeId = ev.tNodeId as EARS.EntityId;
      const data = getExtendedTNodeData(tNodeId);
      
      system.get(bus).send(emit(brain, {
        type: 'TNODE_OPENED',
        tNodeId,
        data
      }));
    },
    goBackTNode: ({ system, context }) => {
      const data = getStartupData();
      
      system.get(bus).send(emit(brain, {
        type: 'TNODE_OPENED',
        tNodeId: data.flowTNodeId,
        data
      }));
    },
    handleEventReceived: ({ system, event, context }) => {
      if (event.type === 'TRACE_EVENT_RECEIVED') {
        // Pulse the event in UI
        system.get(bus).send(emit(brain, {
          type: 'EVENT_PULSE',
          eventType: event.data.eventType
        }));
        
        // Forward event to brain runner
        system.get(brainBus).send({ 
          type: event.data.eventType, 
          payload: event.data.payload 
        });
      }
    },
  },
}).createMachine(
  {
    id: brain,
    initial: 'idle',
    context: ({ input }) => ({
      brainId: input,
    }),
    on: {},
    states: {
      idle: {
        on: {
          CLIENT_CONNECTED: {
            actions: ['sendFlowTNodeData'],
            target: 'running',
          },
        },
      },
      running: {
        entry: ['startBrain'],
        on: {
          CLIENT_CONNECTED: {
            actions: 'sendFlowTNodeData',
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
          TRACE_EVENT_RECEIVED: {
            actions: 'handleEventReceived',
          },
        },
      }
    },
  }
);
