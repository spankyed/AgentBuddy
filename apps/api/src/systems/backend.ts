import { emit, setup, enqueueActions } from 'xstate';
import type { IncomingSystemEvents, OutgoingSystemEvents } from '@/shared/events';
import systems from '@/systems';
import type { SystemId } from '@/shared/actor-helpers';

export type BusEvent = 
  | { type: 'INCOMING'; event: IncomingSystemEvents }
  | { type: 'OUTGOING'; event: OutgoingSystemEvents}

export interface BusContext {
  threads: string[];
}

export const bus = 'bus' as const;

export const backendSystem = setup({
  types: {
    context: {} as BusContext,
    events: {} as BusEvent,
    emitted: {} as Extract<BusEvent, { type: 'OUTGOING' }>,
  },
  actions: {
    routeIncoming: ({ event: incoming, system }) => {
      console.log('Routing incoming event:', incoming);
      const { systemId, ...event } = incoming.event;
      system.get(systemId).send(event);
    },
    spawnActors: enqueueActions(({ enqueue }) => {
      for (const [id, state] of Object.entries(systems)) {
        enqueue.spawnChild(state, { systemId: id as SystemId });
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