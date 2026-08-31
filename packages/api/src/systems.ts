import { setup, enqueueActions, fromCallback, spawnChild } from 'xstate';
import { systems, allDefs, buildEventValidationMap } from '@/registries/systems';
import type { ApplicationOutgoingEvents } from '@/core/shared/system-errors';
import type { SystemEvents } from '@abuddy/sdk/framework';
import { safeEvents, type SystemId } from '@/core/shared/actor-helpers';
import { entries } from '@/core/shared';
import { rootEvents } from '@/core/router/bus-emitter';
import { repository } from '@/repository';
import { bus } from '@/core/system-ids';

// ─── Type aggregation ────────────────────────────────────────────────

export default systems;

type AllDefs = (typeof allDefs)[number];

export type IncomingSystemEvents = AllDefs['_incoming'];
export type OutgoingSystemEvents = AllDefs['_outgoing'] | ApplicationOutgoingEvents;

export const eventValidationMap = buildEventValidationMap();

// ─── Bus actor ───────────────────────────────────────────────────────

export type BusEvent =
  | { type: 'INCOMING'; event: IncomingSystemEvents }
  | { type: 'OUTGOING'; event: OutgoingSystemEvents }

export type { SystemEvents };

export type BackendEvents =
  | BusEvent
  | SystemEvents

export interface BusContext {
  threads: string[];
}
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
    entry: ['spawnActors', 'setupEventListeners'],
    states: {
      disconnected: {
        on: {
          CLIENT_CONNECTED: {
            target: 'connected',
          },
        },
      },
      connected: {
        entry: 'sendConnected',
        on: {
          CLIENT_CONNECTED: {
            target: 'connected',
            reenter: true,
          },
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
