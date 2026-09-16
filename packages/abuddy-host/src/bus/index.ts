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

/** Restarts a pack's systems: stops each running one, then starts those still registered */
export type ReloadPackEvent = { type: 'RELOAD_PACK'; packId: string; systemIds: string[] };
export type TeardownPackEvent = { type: 'TEARDOWN_PACK'; systemIds: string[] };
export type ActivatePackEvent = { type: 'ACTIVATE_PACK'; packId: string; systemIds: string[] };
/** A client loaded a pack's frontend after connecting: its systems send their startup data */
export type PackClientConnectedEvent = { type: 'PACK_CLIENT_CONNECTED'; packId: string };
/** Raised after restarting a pack's systems, once they're in the actor system and can receive events */
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
  /**
   * Packs whose frontend code a client loads after connecting. A connection's CLIENT_CONNECTED, and a
   * pack's activation, skip their systems: the client sends PACK_CLIENT_CONNECTED for each once it has
   * tried to load the pack's frontend (whether or not that loaded any plugins), and again each time its
   * subscription reconnects, so they get it once per client connection.
   */
  clientLoadedPacks?(): Iterable<string>;
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

/** Spawns each of `systemIds` the bus runs; returns those it spawned */
function spawnSystems(
  enqueue: { spawnChild(machine: AnyStateMachine, options: { systemId: string }): void },
  machines: ReadonlyMap<string, AnyStateMachine>,
  systemIds: readonly string[],
): string[] {
  const spawned = systemIds.filter((id) => machines.has(id));
  for (const id of spawned) enqueue.spawnChild(machines.get(id)!, { systemId: id });
  return spawned;
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
  // Every lookup of what the bus runs goes through this, so a bus given a subset never reaches past it
  const systems = options.systems ?? getRegisteredSystems;
  const clientLoadedPacks = () => new Set(options.clientLoadedPacks?.() ?? []);
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
        const clientLoaded = new Set<string>();
        for (const packId of clientLoadedPacks()) {
          for (const id of getRegisteredPackSystemIds(packId)) clientLoaded.add(id);
        }
        sendClientConnected(system, [...systems().keys()].filter((id) => !clientLoaded.has(id)));
        for (const outgoing of options.connectedEvents?.() ?? []) system.get(bus).send({ type: 'OUTGOING', event: outgoing });
      },
      sendPackConnected: ({ event, system }) => {
        if (event.type !== 'PACK_CLIENT_CONNECTED') return;
        const running = systems();
        sendClientConnected(system, getRegisteredPackSystemIds(event.packId).filter((id) => running.has(id)));
      },
      sendSpawnedConnected: ({ event, system }) => {
        if (event.type === 'SYSTEMS_SPAWNED') sendClientConnected(system, event.systemIds);
      },
      spawnActors: enqueueActions(({ enqueue }) => {
        for (const [id, machine] of systems()) enqueue.spawnChild(machine, { systemId: id });
      }),
      reloadPack: enqueueActions(({ enqueue, event, system }) => {
        if (event.type !== 'RELOAD_PACK') return;
        // Stopping releases each system's id and its children's, so the fresh copies claim them here
        stopSystems(enqueue, system, event.systemIds);
        // A client already has the pack's frontend, so the restarted systems send their startup data.
        // Spawned children join the actor system only after this action runs.
        const spawned = spawnSystems(enqueue, systems(), event.systemIds);
        if (spawned.length > 0) enqueue.raise({ type: 'SYSTEMS_SPAWNED', systemIds: spawned });
      }),
      teardownPack: enqueueActions(({ enqueue, event, system }) => {
        if (event.type !== 'TEARDOWN_PACK') return;
        stopSystems(enqueue, system, event.systemIds);
      }),
      activatePack: enqueueActions(({ enqueue, event }) => {
        if (event.type !== 'ACTIVATE_PACK') return;
        const spawned = spawnSystems(enqueue, systems(), event.systemIds);
        // A pack whose frontend a client loads next gets CLIENT_CONNECTED when the client asks for it
        // (PACK_CLIENT_CONNECTED), once its plugin actors can receive the data; any other sends it now
        if (spawned.length > 0 && !clientLoadedPacks().has(event.packId)) {
          enqueue.raise({ type: 'SYSTEMS_SPAWNED', systemIds: spawned });
        }
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
