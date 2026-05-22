import { setup, enqueueActions, ActorRefFrom, assign, fromCallback, spawnChild } from 'xstate';
import type { IncomingSystemEvents, OutgoingSystemEvents } from '@/core/router/events';
import systems from '@/systems';
import { emit, safeEvents, type SystemId } from '@/core/helpers/actor-helpers';
import { entries } from '@/core/helpers';
import { EARS } from '@/core/types';
import { createEntity } from '@/core/ears';
import { createLogger } from '@/core/helpers/debug/logger';
import { rootEvents } from '@/core/router/bus-emitter';
import { repository } from '@/repository';
import { bus, threads } from '@/core/system-ids';

const logger = createLogger('backend');

export type BusEvent =
  | { type: 'INCOMING'; event: IncomingSystemEvents }
  | { type: 'OUTGOING'; event: OutgoingSystemEvents }

export type SystemEvents =
  | { type: 'CLIENT_CONNECTED'; }

export type BackendEvents =
  | BusEvent
  | SystemEvents

export interface BusContext {
  threads: string[];
}
let birthFlowStarted = false;

const typeOf = safeEvents<BackendEvents>();
export const backendSystem = setup({
  types: {
    context: {} as BusContext,
    events: {} as BackendEvents,
    emitted: {} as Extract<BackendEvents, { type: 'OUTGOING' }>,
  },
  actors: {
    setupEventListeners: fromCallback(({ sendBack }) => {
      const incomingHandler = (event: any) => {
        if (event.systemId !== 'logs') {
          sendBack({
            type: 'INCOMING',
            event,
          });
        }
      };

      const connectedHandler = () => {
        sendBack({ type: 'CLIENT_CONNECTED' });
      };

      const onConnectedUnsub = rootEvents.onConnected(connectedHandler)
      const onIncomingUnsub = rootEvents.onIncoming(incomingHandler)

      return () => {
        onConnectedUnsub();
        onIncomingUnsub();
      };
    }),
  },
  actions: {
    setupEventListeners: spawnChild('setupEventListeners'),
    notify: ({ event }) => {
      rootEvents.emitOutgoing(typeOf('OUTGOING', event).event);
    },
    routeIncoming: ({ event: incoming, system }) => {
      const { systemId, ...event } = typeOf('INCOMING', incoming).event;
      system.get(systemId).send(event);
    },
    sendConnected: (({ system }) => {
      for (const id of Object.keys(systems)) {
        system.get(id).send({ type: 'CLIENT_CONNECTED' });
      }

      const internalSettings = repository.settingsQueries.getInternalSettings();
      system.get(bus).send({
        type: 'OUTGOING',
        event: {
          type: 'CLIENT_CONNECTED',
          hasOnboarded: internalSettings.hasOnboarded,
          pluginId: 'application'
        }
      });

      // Start onboarding flow once per server session for first-time users
      if (!internalSettings.hasOnboarded && !birthFlowStarted) {
        birthFlowStarted = true;
        const threadsActor = system.get(threads);
        if (threadsActor) {
          threadsActor.send({ type: 'BIRTH_FLOW_START' });
        }
      }
    }),
    spawnActors: enqueueActions(({ enqueue }) => {
      for (const [id, state] of entries(systems)) {
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
      CLIENT_CONNECTED: {
        target: '.connected',
      },
    },
    entry: ['spawnActors', 'setupEventListeners'],
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
            actions: 'notify',
          },
        }
      },
    }
  }
);
