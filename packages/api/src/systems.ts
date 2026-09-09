import { setup, enqueueActions, fromCallback, spawnChild } from 'xstate';
import { getRegisteredSystems, buildRegisteredEventValidationMap } from '@/core/packs/pack-registration';
import type { ApplicationOutgoingEvents } from '@/core/shared/system-errors';
import type { SystemEvents } from '@abuddy/sdk/framework';
import { safeEvents } from '@/core/shared/actor-helpers';
import { rootEvents } from '@/core/router/bus-emitter';
import { repository } from '@abuddy/sdk/ears';
import { bus } from '@/core/system-ids';
import { getDesignated, hasDesignation } from '@abuddy/sdk';

// ─── Type aggregation ────────────────────────────────────────────────

export type IncomingSystemEvents = { type: string; systemId: string; [key: string]: unknown };
export type OutgoingSystemEvents = { type: string; pluginId: string; [key: string]: unknown } | ApplicationOutgoingEvents;

let _eventValidationMap: Map<string, Set<string>> | null = null;
export function getEventValidationMap(): Map<string, Set<string>> {
  if (!_eventValidationMap) {
    _eventValidationMap = buildRegisteredEventValidationMap();
  }
  return _eventValidationMap;
}

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
        if (!hasDesignation('logs') || event.systemId !== getDesignated('logs')) {
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
    sendConnected: (({ system, event }) => {
      const systems = getRegisteredSystems();
      for (const id of systems.keys()) {
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
      const systems = getRegisteredSystems();
      for (const [id, state] of systems) {
        enqueue.spawnChild(state, { systemId: id });
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
            actions: 'sendConnected',
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
