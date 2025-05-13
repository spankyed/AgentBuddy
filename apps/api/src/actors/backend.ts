import { emit, setup, enqueueActions } from 'xstate';
import type { IncomingPluginEvents, OutgoingPluginEvents } from '@/shared/events';
import actorStates from '@/actors';

export type BusEvent = 
  | { type: 'INCOMING'; event: IncomingPluginEvents }
  | { type: 'OUTGOING'; event: OutgoingPluginEvents}

export interface BusContext {
  threads: string[];
  actors: Record<string, any>;
}

export const bus = 'bus' as const;

const actorMap = Object.fromEntries(
  // Each state machine exposes its id as a string literal
  (actorStates as { id: string }[]).map((state) => [state.id, state])
) as Record<string, any>;

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
    spawnActors: enqueueActions(({ enqueue, context }) => {
      for (const [id, state] of Object.entries(context.actors)) {
        enqueue.spawnChild(state, { systemId: id });
      }
    }),
  }
}).createMachine(
  {
    id: bus,
    entry: 'spawnActors',
    context: {
      threads: [],
      actors: actorMap,
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