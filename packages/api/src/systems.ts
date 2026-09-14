import { setup, enqueueActions, fromCallback, spawnChild } from 'xstate';
import { getRegisteredSystems, getRegisteredPackSystemIds, buildRegisteredEventValidationMap } from '@abuddy/host/packs';
import type { ApplicationOutgoingEvents } from '@/core/shared/system-errors';
import type { SystemEvents } from '@abuddy/sdk/framework';
import { safeEvents } from '@/core/shared/actor-helpers';
import { rootEvents } from '@/core/router/bus-emitter';
import { settingsRepository } from '@/core/settings-repository';
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

export function invalidateEventValidationMap(): void {
  _eventValidationMap = null;
}

// ─── Bus actor ───────────────────────────────────────────────────────

/** Sends CLIENT_CONNECTED to each system, so it sends its startup data */
function sendClientConnected(system: { get(id: string): { send(event: { type: string }): void } | undefined }, systemIds: string[]): void {
  for (const id of systemIds) {
    const actor = system.get(id);
    if (actor) actor.send({ type: 'CLIENT_CONNECTED' });
    else console.warn(`[bus] CLIENT_CONNECTED: system "${id}" isn't running`);
  }
}

export type BusEvent =
  | { type: 'INCOMING'; event: IncomingSystemEvents }
  | { type: 'OUTGOING'; event: OutgoingSystemEvents }

export type { SystemEvents };

export type ReloadPackEvent = { type: 'RELOAD_PACK'; packId: string; systemIds: string[] };
export type TeardownPackEvent = { type: 'TEARDOWN_PACK'; systemIds: string[] };
export type ActivatePackEvent = { type: 'ACTIVATE_PACK'; systemIds: string[] };
/** A client loaded a pack's frontend: its systems resend their startup data */
export type PackClientConnectedEvent = { type: 'PACK_CLIENT_CONNECTED'; packId: string };
/** Raised after spawning systems, once they're in the actor system and can receive events */
export type SystemsSpawnedEvent = { type: 'SYSTEMS_SPAWNED'; systemIds: string[] };

export type BackendEvents =
  | BusEvent
  | SystemEvents
  | ReloadPackEvent
  | TeardownPackEvent
  | ActivatePackEvent
  | PackClientConnectedEvent
  | SystemsSpawnedEvent

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
      const onPackConnectedUnsub = rootEvents.onPackClientConnected((packId) => sendBack({ type: 'PACK_CLIENT_CONNECTED', packId }));
      const onIncomingUnsub = rootEvents.onIncoming(incomingHandler)

      return () => {
        onConnectedUnsub();
        onPackConnectedUnsub();
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
      const actor = system.get(systemId);
      if (actor) {
        actor.send(event);
      } else {
        console.warn(`[bus] routeIncoming: system "${systemId}" not found (may be reloading), dropping event "${event.type}"`);
      }
    },
    sendConnected: (({ system }) => {
      const systems = getRegisteredSystems();
      for (const id of systems.keys()) {
        system.get(id).send({ type: 'CLIENT_CONNECTED' });
      }

      const internalSettings = settingsRepository.settingsQueries.getInternalSettings();
      system.get(bus).send({
        type: 'OUTGOING',
        event: {
          type: 'CLIENT_CONNECTED',
          hasOnboarded: internalSettings.hasOnboarded,
          pluginId: 'application'
        }
      });

    }),
    sendPackConnected: ({ event, system }) => {
      sendClientConnected(system, getRegisteredPackSystemIds(typeOf('PACK_CLIENT_CONNECTED', event).packId));
    },
    sendSpawnedConnected: ({ event, system }) => {
      sendClientConnected(system, typeOf('SYSTEMS_SPAWNED', event).systemIds);
    },
    spawnActors: enqueueActions(({ enqueue }) => {
      const systems = getRegisteredSystems();
      for (const [id, state] of systems) {
        (enqueue as any).spawnChild(state, { id, systemId: id });
      }
    }),
    reloadPack: enqueueActions(({ enqueue, event }) => {
      const { systemIds } = event as ReloadPackEvent;
      for (const id of systemIds) {
        (enqueue as any).stopChild(id);
      }
      const machines = getRegisteredSystems();
      for (const id of systemIds) {
        const machine = machines.get(id);
        if (machine) {
          (enqueue as any).spawnChild(machine, { id, systemId: id });
        }
      }
      // Spawned children join the actor system only after this action runs
      enqueue.raise({ type: 'SYSTEMS_SPAWNED', systemIds });
    }),
    teardownPack: enqueueActions(({ enqueue, event }) => {
      const { systemIds } = event as TeardownPackEvent;
      for (const id of systemIds) {
        (enqueue as any).stopChild(id);
      }
    }),
    activatePack: enqueueActions(({ enqueue, event }) => {
      const { systemIds } = event as ActivatePackEvent;
      const machines = getRegisteredSystems();
      for (const id of systemIds) {
        const machine = machines.get(id);
        if (machine) {
          (enqueue as any).spawnChild(machine, { id, systemId: id });
        }
      }
      // Spawned children join the actor system only after this action runs
      enqueue.raise({ type: 'SYSTEMS_SPAWNED', systemIds });
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
          RELOAD_PACK: {
            actions: 'reloadPack',
          },
          TEARDOWN_PACK: {
            actions: 'teardownPack',
          },
          ACTIVATE_PACK: {
            actions: 'activatePack',
          },
          SYSTEMS_SPAWNED: {
            actions: 'sendSpawnedConnected',
          },
          PACK_CLIENT_CONNECTED: {
            actions: 'sendPackConnected',
          },
        }
      },
    }
  }
);
