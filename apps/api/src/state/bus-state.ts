import { emit, setup } from 'xstate';
import type { IncomingPluginEvents, OutgoingPluginEvents } from '../shared/events';

export type BusEvent = 
  | { type: 'INCOMING'; event: IncomingPluginEvents }
  | { type: 'OUTGOING'; event: OutgoingPluginEvents}

export interface BusContext {
  threads: string[];
}

type OutgoingEvent = Extract<BusEvent, { type: 'OUTGOING' }>;

export const bus = 'bus' as const;

export const busMachine = setup({
  types: {
    context: {} as BusContext,
    events: {} as BusEvent,
    emitted: {} as OutgoingEvent,
  },
  actions: {
    routeIncoming: ({ event, system }) => {
      // Handle incoming event
      console.log('Routing incoming event:', event);
      system.get(event.event.plugin).send(event);
    }
  }
}).createMachine(
  {
    id: bus,
    context: {
      threads: [],
    },
    on: {
      INCOMING: {
        actions: 'routeIncoming'
      },
      OUTGOING: {
        actions: emit(({ event }) => event),
      },
    }
  }
);