import { emit as notify, setup, enqueueActions, sendTo } from 'xstate';
import type { IncomingSystemEvents, OutgoingSystemEvents } from '@/shared/events';
import systems, { agent } from '@/systems';
import { emit, safeEvents, type SystemId } from '@/shared/actor-helpers';

export type BusEvent = 
  | { type: 'WAKEUP'; }
  | { type: 'INCOMING'; event: IncomingSystemEvents }
  | { type: 'OUTGOING'; event: OutgoingSystemEvents}

export interface BusContext {
  threads: string[];
}

export const bus = 'bus' as const;

const typeOf = safeEvents<BusEvent>();
export const backendSystem = setup({
  types: {
    context: {} as BusContext,
    events: {} as BusEvent,
    emitted: {} as Extract<BusEvent, { type: 'OUTGOING' }>,
  },
  actions: {
    routeIncoming: ({ event: incoming, system, }) => {
      console.log('Incoming event:', incoming);
      const { systemId, ...event } = typeOf('INCOMING', incoming).event;
      system.get(systemId).send(event);
    },
    sendConnected: (({ system }) => {
      for (const id of Object.keys(systems)) {
        system.get(id).send({ type: 'WAKEUP' });
      }
    }),
    spawnActors: enqueueActions(({ enqueue }) => {
      for (const [id, state] of Object.entries(systems)) {
        enqueue.spawnChild(state, { systemId: id as SystemId });
      }
    }),
  }
}).createMachine(
  {
    id: bus,
    context: {
      threads: [],
    },
    initial: 'disconnected',
    on: {
      WAKEUP: {
        target: '.connected',
      },
    },
    entry: 'spawnActors',
    states: {
      disconnected: {
      },
      connected: {
        entry: 'sendConnected',
        on: {
          INCOMING: {
            actions: 'routeIncoming'
          },
          OUTGOING: {
            actions: notify(({ event }) => event),
          },
        }
      },
    }
  }
);
