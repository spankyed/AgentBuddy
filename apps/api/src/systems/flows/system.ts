import { assign, cancel, createMachine, fromPromise, log, raise, sendTo, setup, type ErrorActorEvent } from 'xstate';
import type { MergeReceivable } from '@/shared/utils/event-helpers';
import { fromSystem, systemBus } from '@/shared/utils/event-helpers';
import { bus, SystemEvents } from '@/systems/_backend/backend';
import { emit, getActor, safeEvents, sendParentSafe } from '@/shared/utils/actor-helpers';
// import { addMessageToLatestThread, getLatestMessage } from './accessors';
import { EARS } from '@/shared/ears/types';
import flowsStartupData from './repository/startup';
import { FlowsStartupData, FlowEntity } from './types';
import { getExtendedData } from './repository/read';
import { createFlow } from './repository/create';
import { updateFlowLabel } from './repository/update';
import { z } from 'zod';

const typeOf = safeEvents<ReceivableEvents>();

export const flows = 'flows' as const;

const busEvent = systemBus(flows);

export const IncomingFlowsEvents = [
  busEvent('FLOW_SELECT', { flowId: z.string() }),
  busEvent('CREATE_FLOW', {}),
  busEvent('UPDATE_FLOW_LABEL', { flowId: z.string(), label: z.string() }),
] as const

export type FlowsInternalEvents = 
  | SystemEvents

export type OutgoingFlowsEvents =
  | { type: 'FLOWS_STARTUP'; data: FlowsStartupData }
  | { type: 'FLOW_SELECTED'; flowId: EARS.EntityId; data: { nodes: any[]; edges: any[] } }
  | { type: 'FLOW_CREATED'; flow: FlowEntity; flowId: EARS.EntityId }

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
      const flow = getExtendedData(ev.flowId as EARS.EntityId);
      
      system.get(bus).send(emit(flows, {
        type: 'FLOW_SELECTED',
        flowId: ev.flowId as EARS.EntityId,
        data: flow
      }));
    },
    createFlow: ({ system }) => {
      const newFlow = createFlow();

      system.get(bus).send(emit(flows, {
        type: 'FLOW_CREATED',
        flow: newFlow,
        flowId: newFlow.id,
      }));
    },
    updateFlowLabel: ({ event }) => {
      const ev = typeOf('UPDATE_FLOW_LABEL', event);
      updateFlowLabel(ev.flowId as EARS.EntityId, ev.label);
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
      CREATE_FLOW: {
        actions: 'createFlow',
      },
      UPDATE_FLOW_LABEL: {
        actions: 'updateFlowLabel',
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
