import { emit, setup } from 'xstate';
import type { IncomingPluginEvents, OutgoingPluginEvents } from '../shared/events';

export type BusEvent = 
  | { type: 'INCOMING'; event: IncomingPluginEvents }
  | { type: 'OUTGOING'; event: OutgoingPluginEvents}

export interface BusContext {
  threads: string[];
}

export const bus = 'bus' as const;

export const busMachine = setup({
  types: {
    context: {} as BusContext,
    events: {} as BusEvent,
    emitted: {} as Extract<BusEvent, { type: 'OUTGOING' }>,
  },
  actions: {
    routeIncoming: ({ event: incoming, system }) => {
      console.log('Routing incoming event:', incoming);
      const { plugin, ...event } = incoming.event;
      system.get(plugin).send(event);
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