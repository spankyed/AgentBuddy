import { emit, setup, enqueueActions } from 'xstate';
import type { IncomingPluginEvents, OutgoingPluginEvents } from '@/shared/events';
import systemStates from '@/systems';
import type { SystemIds } from '@/shared/actor-helpers';

export type BusEvent = 
  | { type: 'INCOMING'; event: IncomingPluginEvents }
  | { type: 'OUTGOING'; event: OutgoingPluginEvents}

export interface BusContext {
  threads: string[];
}

export const bus = 'bus' as const;

export const backendState = setup({
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
    },
    spawnActors: enqueueActions(({ enqueue }) => {
      for (const [id, state] of Object.entries(systemStates)) {
        enqueue.spawnChild(state, { systemId: id as SystemIds });
      }
    }),
  }
}).createMachine(
  {
    id: bus,
    entry: 'spawnActors',
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