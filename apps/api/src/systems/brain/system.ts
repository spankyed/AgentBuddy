import { assign, cancel, fromPromise, log, raise, sendTo, setup, type ErrorActorEvent } from 'xstate';
import type { MergeReceivable } from '@/shared/utils/event-helpers';
import { fromSystem, systemBus } from '@/shared/utils/event-helpers';
import { bus } from '@/systems/_bus/backend';
import { emit, getActor, safeEvents, sendParentSafe } from '@/shared/utils/actor-helpers';
// import { addMessageToLatestThread, getLatestMessage } from './accessors';
import type { EARS } from '@/shared/ears/types';
import { getStartupData } from './startup-data';

const typeOf = safeEvents<ReceivableEvents>();

export const brain = 'brain' as const;

const busEvent = systemBus(brain);

export const IncomingBrainEvents = [
  busEvent('EMPTY_BRAIN', {}),
] as const

export type BrainInternalEvents = 
  | { type: 'CLIENT_CONNECTED' }

export type OutgoingBrainEvents =
  | { type: 'STARTUP'; startupData: ReturnType<typeof getStartupData> }

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
    sendFEStartup: ({ system }) => {
      system.get(bus).send(emit('application', { 
        type: 'STARTUP',
        startupData: getStartupData()
      }));
    },
    logError: (_, event: ErrorActorEvent<unknown, string>) => {
      console.error('Chat stream error:', event.error);
    },
  },
}).createMachine(
  {
    id: brain,
    initial: 'idle',
    context: ({ input }) => ({
      brainId: input,
    }),
    on: {
    },
    states: {
      idle: {
        on: {
          CLIENT_CONNECTED: {
            actions: 'sendFEStartup',
          },
        },
      },
    },
  }
);
