// The backend bus: spawns the registered systems, routes client events to them and their events to
// clients. The app composes it with its event sources and client sink (createAppBus, app-bus.ts); the pack
// test harness runs the same machine with a recording sink.
import { enqueueActions, fromCallback, setup, spawnChild, type AnyActorRef, type AnyStateMachine } from 'xstate';
import { reportError } from '@abuddy/sdk/logger';
import { bus } from '@abuddy/sdk/ids';
import type { Message } from '@abuddy/sdk/events';
import type { PackRegistry } from '../packs/pack-registration.ts';

/** A message in for a system (INCOMING) or out for a plugin (OUTGOING) */
export type BusEvent =
  | { type: 'INCOMING'; message: Message }
  | { type: 'OUTGOING'; message: Message };

/** Restarts a pack's systems: stops each running one, then starts those still registered */
export type ReloadPackEvent = { type: 'RELOAD_PACK'; packId: string; systemIds: string[] };
export type TeardownPackEvent = { type: 'TEARDOWN_PACK'; systemIds: string[] };
export type ActivatePackEvent = { type: 'ACTIVATE_PACK'; packId: string; systemIds: string[] };
/** A client loaded a pack's frontend after connecting: its systems send their startup data */
export type PackClientConnectedEvent = { type: 'PACK_CLIENT_CONNECTED'; packId: string };
/**
 * A pack was activated, reloaded or torn down while the app runs, or its seeds were imported: what it
 * registers (its slash commands) and the data it seeded may differ, so every running system can refresh
 * what it reads. Raised once the change is complete. Boot raises nothing: the systems start after it.
 */
export type PackChangedEvent = { type: 'PACK_CHANGED'; packId: string };
/** Raised after restarting a pack's systems, once they're in the actor system and can receive events */
export type SystemsSpawnedEvent = { type: 'SYSTEMS_SPAWNED'; systemIds: string[] };

export type BackendEvents =
  | BusEvent
  | { type: 'CLIENT_CONNECTED' }
  | ReloadPackEvent
  | TeardownPackEvent
  | ActivatePackEvent
  | PackClientConnectedEvent
  | PackChangedEvent
  | SystemsSpawnedEvent;

/** The events a bus source can feed it: OUTGOING for sends to plugins from outside a system (`sendToPlugin`) */
export type BusSourceEvent = Extract<BackendEvents, { type: 'INCOMING' | 'OUTGOING' | 'CLIENT_CONNECTED' | 'PACK_CLIENT_CONNECTED' }>;

export interface BusOptions {
  /** The registered packs whose systems the bus runs */
  registry: Pick<PackRegistry, 'getRegisteredSystems' | 'getRegisteredPackSystemIds' | 'getPluginEventValidationMap' | 'isPluginReplacing'>;
  /** The systems the bus runs, by id; defaults to every system in `registry` */
  systems?(): ReadonlyMap<string, AnyStateMachine>;
  /** Delivers a message a system sent to a frontend plugin */
  onOutgoing(message: Message): void;
  /** Feeds the bus client events (INCOMING, CLIENT_CONNECTED, PACK_CLIENT_CONNECTED) and sends to plugins (OUTGOING); returns the unsubscribe */
  listen(send: (event: BusSourceEvent) => void): () => void;
  /**
   * Packs whose frontend code a client loads after connecting. A connection's CLIENT_CONNECTED, and a
   * pack's activation, skip their systems: the client sends PACK_CLIENT_CONNECTED for each once it has
   * tried to load the pack's frontend (whether or not that loaded any plugins), and again each time its
   * subscription reconnects, so they get it once per client connection.
   */
  clientLoadedPacks?(): Iterable<string>;
  /** Messages the bus sends to clients after each client connection's CLIENT_CONNECTED reached the systems */
  connectedEvents?(): Message[];
}

type ActorSystemLike = { get(id: string): { send(event: { type: string }): void } | undefined };

/** Sends an event to each of `systemIds` that is running; a system that isn't started just doesn't get it */
function sendToRunning(system: ActorSystemLike, systemIds: Iterable<string>, event: { type: string; [key: string]: unknown }): void {
  for (const id of systemIds) system.get(id)?.send(event);
}

/** Sends CLIENT_CONNECTED to each system, so it sends its startup data */
function sendClientConnected(system: ActorSystemLike, systemIds: Iterable<string>): void {
  for (const id of systemIds) {
    const actor = system.get(id);
    if (actor) actor.send({ type: 'CLIENT_CONNECTED' });
    else console.warn(`[bus] CLIENT_CONNECTED: system "${id}" isn't running`);
  }
}

/**
 * Spawns each of `systemIds` the bus runs; returns those it spawned. Each is spawned under its own id as
 * well as its system id: the id is the key the bus tracks the child by, so without one every system (and
 * the `listen` actor) shares a key, the bus holds only the last one spawned, and stopping the bus stops
 * that one alone — the rest keep running.
 */
function spawnSystems(
  enqueue: unknown,
  machines: ReadonlyMap<string, AnyStateMachine>,
  systemIds: readonly string[],
): string[] {
  // XState types `id` from the machine's declared children, and the bus's are whatever is registered
  const spawner = enqueue as { spawnChild(machine: AnyStateMachine, options: { id: string; systemId: string }): void };
  const spawned = systemIds.filter((id) => machines.has(id));
  for (const id of spawned) spawner.spawnChild(machines.get(id)!, { id, systemId: id });
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
  const { registry } = options;
  const systems = options.systems ?? registry.getRegisteredSystems;
  const clientLoadedPacks = () => new Set(options.clientLoadedPacks?.() ?? []);
  /**
   * The `<plugin>/<type>` pairs whose drop has already been reported, so each is reported once per bus.
   *
   * Reporting a drop logs it, and a log event becomes a send to the logs plugin (default-setup's logs
   * system forwards it as LOG_ADDED). When the plugin being dropped is that one, reporting a drop
   * produces another droppable send, and the cycle feeds itself.
   *
   * It feeds itself through the actor's queue rather than the call stack — the send arrives as a fresh
   * OUTGOING event, not a nested call — so it shows up as an app that stops responding rather than a
   * stack overflow, and nothing that reasons about re-entrancy within one transition can see it.
   * Reporting each pair once bounds it whatever the timing, keeps the first of every distinct problem,
   * and independently stops a misbehaving pack from flooding the log.
   *
   * Scoped to the machine, not the module: a test app's drops are its own.
   */
  const reportedDrops = new Set<string>();
  return setup({
    types: {
      events: {} as BackendEvents,
    },
    actors: {
      listen: fromCallback<BackendEvents>(({ sendBack }) => options.listen(sendBack)),
    },
    actions: {
      // Its own id, so it doesn't share a key with the systems spawned beside it
      listen: spawnChild('listen', { id: 'bus-listen' }),
      notify: ({ event }) => {
        if (event.type !== 'OUTGOING') return;
        // The counterpart of receiveClientEvent: a client's event is checked against what a system
        // accepts, and a system's event against what the plugin receives. Reported and dropped rather
        // than thrown — the caller is a running system, and a malformed message must not take it down.
        // takeSystemErrors fails any pack test that leaves one, so this is loud where it should be.
        const { to: pluginId, event: { type } } = event.message;
        const accepted = options.registry.getPluginEventValidationMap().get(pluginId);
        const reportDrop = (message: string) => {
          // A pack mid-replacement has no systems running and no plugins registered until its
          // replacement lands. Dropping is right; saying something went wrong is not.
          if (options.registry.isPluginReplacing(pluginId)) return;
          const pair = `${pluginId}/${type}`;
          if (reportedDrops.has(pair)) return;
          reportedDrops.add(pair);
          // `diagnostic`: logged, recorded, and failing any pack test that leaves one — but no toast.
          // Whoever is using the app can do nothing about a send to a plugin nobody declares, and the
          // message already reaches the Logs plugin, where the person who can is looking.
          reportError({ source: 'bus', operation: 'sendToPlugin', severity: 'diagnostic', error: new Error(message) });
        };
        if (accepted === undefined) {
          reportDrop(`Dropped "${type}" sent to "${pluginId}", which no registered pack declares as a plugin that receives events. Check the id, or give the plugin's own pack a system that declares what it sends there.`);
          return;
        }
        if (!accepted.has(type)) {
          reportDrop(`Dropped "${type}" sent to the "${pluginId}" plugin, which declares no such event. A plugin receives what its own pack's systems declare they emit: add it to that system's outgoing events, or send an event the plugin handles.`);
          return;
        }
        options.onOutgoing(event.message);
      },
      routeIncoming: ({ event, system }) => {
        if (event.type !== 'INCOMING') return;
        const { to, event: incoming } = event.message;
        const actor = system.get(to);
        if (actor) actor.send(incoming);
        else console.warn(`[bus] routeIncoming: system "${to}" not found (may be reloading), dropping event "${incoming.type}"`);
      },
      sendConnected: ({ system }) => {
        const clientLoaded = new Set<string>();
        for (const packId of clientLoadedPacks()) {
          for (const id of registry.getRegisteredPackSystemIds(packId)) clientLoaded.add(id);
        }
        sendClientConnected(system, [...systems().keys()].filter((id) => !clientLoaded.has(id)));
        for (const message of options.connectedEvents?.() ?? []) system.get(bus).send({ type: 'OUTGOING', message });
      },
      sendPackConnected: ({ event, system }) => {
        if (event.type !== 'PACK_CLIENT_CONNECTED') return;
        const running = systems();
        sendClientConnected(system, registry.getRegisteredPackSystemIds(event.packId).filter((id) => running.has(id)));
      },
      // Every system, not just the changed pack's: what a pack registers and seeds is read by others
      // (its slash commands by the chat, say)
      sendPackChanged: ({ event, system }) => {
        if (event.type !== 'PACK_CHANGED') return;
        sendToRunning(system, systems().keys(), { type: 'PACK_CHANGED', packId: event.packId });
      },
      sendSpawnedConnected: ({ event, system }) => {
        if (event.type === 'SYSTEMS_SPAWNED') sendClientConnected(system, event.systemIds);
      },
      spawnActors: enqueueActions(({ enqueue }) => {
        const machines = systems();
        spawnSystems(enqueue, machines, [...machines.keys()]);
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
    // A client connection is only what frontend plugins need: sends to plugins are held back until one has
    // connected, and systems send their startup data when one does. Nothing tells the bus a client left (a
    // reconnecting client connects again and gets the startup data), so `clientSeen` means "a client has
    // connected since the bus started", not "one is connected now".
    initial: 'awaitingClient',
    // Listening first: a system sends as it starts (a plugin's report, another system's event), and what it sends
    // before the bus hears the root events is lost
    entry: ['listen', 'spawnActors'],
    // A pack can be installed, uninstalled or rebuilt before any client connects (`abuddy dev` against a
    // running backend, a headless boot), so these apply in both states: handled only once a client connected,
    // the pack's systems would be left as they were with nothing reported. Events for systems don't wait for a
    // client either: systems, steps and schedules send them (`sendToSystem`, `fire`, schedule ticks) from boot.
    on: {
      INCOMING: { actions: 'routeIncoming' },
      RELOAD_PACK: { actions: 'reloadPack' },
      TEARDOWN_PACK: { actions: 'teardownPack' },
      ACTIVATE_PACK: { actions: 'activatePack' },
      PACK_CLIENT_CONNECTED: { actions: 'sendPackConnected' },
      PACK_CHANGED: { actions: 'sendPackChanged' },
    },
    states: {
      awaitingClient: {
        on: {
          CLIENT_CONNECTED: { target: 'clientSeen' },
          // SYSTEMS_SPAWNED is deliberately not handled here: with no client to send startup data to,
          // the systems just spawned get their CLIENT_CONNECTED from `sendConnected` when one arrives
        },
      },
      clientSeen: {
        entry: 'sendConnected',
        on: {
          CLIENT_CONNECTED: { actions: 'sendConnected' },
          OUTGOING: { actions: 'notify' },
          SYSTEMS_SPAWNED: { actions: 'sendSpawnedConnected' },
        },
      },
    },
  });
}
