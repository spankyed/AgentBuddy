import { assign, cancel, fromPromise, log, raise, sendTo, setup, type ErrorActorEvent } from 'xstate';
import type { MergeReceivable } from '@/shared/utils/event-helpers';
import { fromSystem, systemBus } from '@/shared/utils/event-helpers';
import { bus, SystemEvents } from '@/systems/_backend/backend';
import { emit, getActor, safeEvents, sendParentSafe } from '@/shared/utils/actor-helpers';
// import { addMessageToLatestThread, getLatestMessage } from './accessors';
import type { EARS } from '@/shared/ears/types';
import flowsStartupData from './repository/startup';
import { FlowsStartupData } from './types';
import { getExtendedData } from './repository/read';
import { z } from 'zod';

const typeOf = safeEvents<ReceivableEvents>();

export const flows = 'flows' as const;

const busEvent = systemBus(flows);

export const IncomingFlowsEvents = [
  busEvent('EMPTY_FLOWS', {}),
  busEvent('FLOW_SELECT', { flowId: z.string() }),
] as const

export type FlowsInternalEvents = 
  | SystemEvents

export type OutgoingFlowsEvents =
  | { type: 'FLOWS_STARTUP'; data: FlowsStartupData }
  | { type: 'FLOW_SELECTED'; flowId: EARS.EntityId; data: { nodes: any[]; edges: any[] } }

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
    sendFlowsStartupData: ({ system }) => {
      console.log('Sending FE startup event');
      system.get(bus).send(emit(flows, { 
        type: 'FLOWS_STARTUP',
        data: flowsStartupData()
      }));
    },
    sendFlowData: ({ system, event }) => {
      const ev = typeOf('FLOW_SELECT', event);
      const flowData = getExtendedData(ev.flowId as EARS.EntityId);
      
      system.get(bus).send(emit(flows, {
        type: 'FLOW_SELECTED',
        flowId: ev.flowId as EARS.EntityId,
        data: flowData
      }));
    },
    logError: (_, event: ErrorActorEvent<unknown, string>) => {
      console.error('Flow error:', event.error);
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
      FLOW_SELECT: {
        actions: 'sendFlowData',
      },
    },
    states: {
      idle: {
        on: {
          CLIENT_CONNECTED: {
            actions: 'sendFlowsStartupData',
          },
        },
      },
    },
  }
);
