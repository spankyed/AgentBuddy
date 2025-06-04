import { assign, cancel, fromPromise, log, raise, sendTo, setup, type ErrorActorEvent } from 'xstate';
import type { MergeReceivable } from '@/shared/utils/event-helpers';
import { fromSystem, systemBus } from '@/shared/utils/event-helpers';
import { bus } from '@/systems/_backend/backend';
import { emit, getActor, safeEvents, sendParentSafe } from '@/shared/utils/actor-helpers';
// import { addMessageToLatestThread, getLatestMessage } from './accessors';
import type { EARS } from '@/shared/ears/types';

const typeOf = safeEvents<ReceivableEvents>();

export const flows = 'flows' as const;

const busEvent = systemBus(flows);

export const IncomingFlowsEvents = [
  busEvent('EMPTY_FLOWS', {}),
] as const

export type FlowsInternalEvents = 
  | { type: 'CLIENT_CONNECTED' }

export type OutgoingFlowsEvents =
  | { type: 'FLOWS_STARTUP'; startupData: unknown }

export const FlowsSystemEvents = fromSystem(IncomingFlowsEvents)<OutgoingFlowsEvents, typeof flows>()
type ReceivableEvents = MergeReceivable<typeof IncomingFlowsEvents, FlowsInternalEvents>;


export const flowsSystem = setup({
  types: {
    context: {} as {
      flowsId: EARS.EntityId;
    },
    events: {} as ReceivableEvents,
    input: {} as EARS.EntityId,
  },
  actions: {
    sendFEStartup: ({ system }) => {
      console.log('Sending FE startup event');
      // system.get(bus).send(emit('application', { 
      //   type: 'STARTUP',
      //   startupData: getStartupData()
      // }));
    },
    logError: (_, event: ErrorActorEvent<unknown, string>) => {
      console.error('Chat stream error:', event.error);
    },
  },
}).createMachine(
  {
    id: flows,
    initial: 'idle',
    context: ({ input }) => ({
      flowsId: input,
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
