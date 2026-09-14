// The backend bus: spawns the registered systems, routes client events to them and their events to
// clients. The app composes it with its event sources and client sink (api/src/systems.ts); the pack
// test harness runs the same machine with a recording sink.
import { enqueueActions, fromCallback, setup, spawnChild, type AnyActorRef, type AnyStateMachine } from 'xstate';
import { bus } from '@abuddy/sdk/ids';
import { getRegisteredPackSystemIds, getRegisteredSystems } from '../packs/pack-registration.ts';

/** An event for a backend system, as the bus receives it */
export type IncomingSystemEvents = { type: string; systemId: string; [key: string]: unknown };
/** An event for a frontend plugin, as the bus sends it */
export type OutgoingSystemEvents = { type: string; pluginId: string; [key: string]: unknown };

export type BusEvent =
  | { type: 'INCOMING'; event: IncomingSystemEvents }
  | { type: 'OUTGOING'; event: OutgoingSystemEvents };

export type ReloadPackEvent = { type: 'RELOAD_PACK'; packId: string; systemIds: string[] };
export type TeardownPackEvent = { type: 'TEARDOWN_PACK'; systemIds: string[] };
export type ActivatePackEvent = { type: 'ACTIVATE_PACK'; systemIds: string[] };
/** A client loaded a pack's frontend: its systems resend their startup data */
export type PackClientConnectedEvent = { type: 'PACK_CLIENT_CONNECTED'; packId: string };
/** Raised after spawning systems, once they're in the actor system and can receive events */
export type SystemsSpawnedEvent = { type: 'SYSTEMS_SPAWNED'; systemIds: string[] };

export type BackendEvents =
  | BusEvent
  | { type: 'CLIENT_CONNECTED' }
  | ReloadPackEvent
  | TeardownPackEvent
  | ActivatePackEvent
  | PackClientConnectedEvent
  | SystemsSpawnedEvent;

/** The events a bus source can feed it */
export type BusSourceEvent = Extract<BackendEvents, { type: 'INCOMING' | 'CLIENT_CONNECTED' | 'PACK_CLIENT_CONNECTED' }>;

export interface BusOptions {
  /** The systems the bus runs, by id; defaults to every registered system */
  systems?(): ReadonlyMap<string, AnyStateMachine>;
  /** Delivers an event a system sent to a frontend plugin */
  onOutgoing(event: OutgoingSystemEvents): void;
  /** Feeds the bus client events (INCOMING, CLIENT_CONNECTED, PACK_CLIENT_CONNECTED); returns the unsubscribe */
  listen?(send: (event: BusSourceEvent) => void): () => void;
  /** Events the bus sends to clients after each client connection's CLIENT_CONNECTED reached the systems */
  connectedEvents?(): OutgoingSystemEvents[];
}

type ActorSystemLike = { get(id: string): { send(event: { type: string }): void } | undefined };

/** Sends CLIENT_CONNECTED to each system, so it sends its startup data */
function sendClientConnected(system: ActorSystemLike, systemIds: Iterable<string>): void {
  for (const id of systemIds) {
    const actor = system.get(id);
    if (actor) actor.send({ type: 'CLIENT_CONNECTED' });
    else console.warn(`[bus] CLIENT_CONNECTED: system "${id}" isn't running`);
  }
}

/** Systems are spawned by system id only, so they're stopped by reference */
function stopSystems(
  enqueue: { stopChild(actor: AnyActorRef): void },
  system: { get(id: string): AnyActorRef | undefined },
  systemIds: readonly string[],
): void {
  for (const id of systemIds) {
    const actor = system.get(id);
    if (actor) enqueue.stopChild(actor);
  }
}

/** A bus machine; start it with systemId `bus` so systems reach it with `system.get(bus)` */
export function createBusMachine(options: BusOptions) {
  const systems = options.systems ?? getRegisteredSystems;
  return setup({
    types: {
      events: {} as BackendEvents,
    },
    actors: {
      listen: fromCallback<BackendEvents>(({ sendBack }) => options.listen?.(sendBack) ?? (() => {})),
    },
    actions: {
      listen: spawnChild('listen'),
      notify: ({ event }) => {
        if (event.type === 'OUTGOING') options.onOutgoing(event.event);
      },
      routeIncoming: ({ event, system }) => {
        if (event.type !== 'INCOMING') return;
        const { systemId, ...incoming } = event.event;
        const actor = system.get(systemId);
        if (actor) actor.send(incoming);
        else console.warn(`[bus] routeIncoming: system "${systemId}" not found (may be reloading), dropping event "${incoming.type}"`);
      },
      sendConnected: ({ system }) => {
        sendClientConnected(system, systems().keys());
        for (const outgoing of options.connectedEvents?.() ?? []) system.get(bus).send({ type: 'OUTGOING', event: outgoing });
      },
      sendPackConnected: ({ event, system }) => {
        if (event.type === 'PACK_CLIENT_CONNECTED') sendClientConnected(system, getRegisteredPackSystemIds(event.packId));
      },
      sendSpawnedConnected: ({ event, system }) => {
        if (event.type === 'SYSTEMS_SPAWNED') sendClientConnected(system, event.systemIds);
      },
      spawnActors: enqueueActions(({ enqueue }) => {
        for (const [id, machine] of systems()) enqueue.spawnChild(machine, { systemId: id });
      }),
      reloadPack: enqueueActions(({ enqueue, event, system }) => {
        if (event.type !== 'RELOAD_PACK') return;
        stopSystems(enqueue, system, event.systemIds);
        const machines = getRegisteredSystems();
        for (const id of event.systemIds) {
          const machine = machines.get(id);
          if (machine) enqueue.spawnChild(machine, { systemId: id });
        }
        // Spawned children join the actor system only after this action runs
        enqueue.raise({ type: 'SYSTEMS_SPAWNED', systemIds: event.systemIds });
      }),
      teardownPack: enqueueActions(({ enqueue, event, system }) => {
        if (event.type !== 'TEARDOWN_PACK') return;
        stopSystems(enqueue, system, event.systemIds);
      }),
      activatePack: enqueueActions(({ enqueue, event }) => {
        if (event.type !== 'ACTIVATE_PACK') return;
        const machines = getRegisteredSystems();
        for (const id of event.systemIds) {
          const machine = machines.get(id);
          if (machine) enqueue.spawnChild(machine, { systemId: id });
        }
        enqueue.raise({ type: 'SYSTEMS_SPAWNED', systemIds: event.systemIds });
      }),
    },
  }).createMachine({
    id: bus,
    initial: 'disconnected',
    entry: ['spawnActors', 'listen'],
    states: {
      disconnected: {
        on: {
          CLIENT_CONNECTED: { target: 'connected' },
        },
      },
      connected: {
        entry: 'sendConnected',
        on: {
          CLIENT_CONNECTED: { actions: 'sendConnected' },
          INCOMING: { actions: 'routeIncoming' },
          OUTGOING: { actions: 'notify' },
          RELOAD_PACK: { actions: 'reloadPack' },
          TEARDOWN_PACK: { actions: 'teardownPack' },
          ACTIVATE_PACK: { actions: 'activatePack' },
          SYSTEMS_SPAWNED: { actions: 'sendSpawnedConnected' },
          PACK_CLIENT_CONNECTED: { actions: 'sendPackConnected' },
        },
      },
    },
  });
}
