// The app's bus: the bus machine wired to the app's root event bus (the api's tRPC clients), which the
// SDK reaches through the bound HostRuntime's transport.
import { createActor, type AnyActorRef } from 'xstate';
import { _rootEvents } from '@abuddy/sdk/runtime';
import type { HostPluginEvents } from '@abuddy/sdk/events';
import type { FeatureRef } from '@abuddy/sdk/ids';
import { appState } from '../app-state/index.ts';
import type { PackRegistry } from '../packs/registry.ts';
import { getPacksWithClientLoadedFrontends } from '../packs/layout.ts';
import { createBusMachine } from './machine.ts';
import { pluginVisibility } from '../features/application/be/system.ts';
import { HOST } from '../refs.ts';

/** Sent to the application plugin after each client connection: the app shell's state, which the window opens with */
export type ApplicationConnectedEvent = Extract<HostPluginEvents['host/application'], { type: 'CLIENT_CONNECTED' }>;

/** What `startEarlySystems` started, as the app's bus needs it */
export interface EarlySystems {
  /** Their refs: the bus leaves messages sent to them to `startEarlySystems` */
  refs: ReadonlySet<string>;
  /** Tells them a client connected; the bus calls it once it has taken the connection itself */
  connected(): void;
}

const NO_EARLY_SYSTEMS: EarlySystems = { refs: new Set(), connected: () => {} };

/** The app's bus: the systems in `registry`, clients over the root event bus on the shared bus core, and `early`'s connections */
export function createAppBus(registry: PackRegistry, early: EarlySystems = NO_EARLY_SYSTEMS) {
  return createBusMachine({
    registry,
    onOutgoing: (message) => _rootEvents.emitOutgoing(message),
    listen: (send) => {
      const unsubscribes = [
        // The bus first, so what an early system sends in answer (the logs system's startup data) finds a client
        // connected: told before the bus, it arrived while the bus still dropped sends to plugins
        _rootEvents.onConnected(() => {
          send({ type: 'CLIENT_CONNECTED' });
          early.connected();
        }),
        _rootEvents.onPackClientConnected((packId) => send({ type: 'PACK_CLIENT_CONNECTED', packId })),
        // Sends to plugins from outside a system go through the bus, which drops them until a client connects
        _rootEvents.onPluginSend((message) => send({ type: 'OUTGOING', message })),
        _rootEvents.onIncoming((message) => {
          if (!early.refs.has(message.to)) send({ type: 'INCOMING', message });
        }),
      ];
      return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
    },
    // Each client asks for these packs' startup data once it has tried loading their frontends (bus.packClientReady)
    clientLoadedPacks: () => getPacksWithClientLoadedFrontends(registry),
    connectedEvents: () => {
      const { hasOnboarded, lastActivePlugin } = appState.get();
      const event: ApplicationConnectedEvent = {
        type: 'CLIENT_CONNECTED',
        hasOnboarded,
        pluginVisibility: pluginVisibility(registry),
        ...(lastActivePlugin !== undefined && { lastActivePlugin }),
      };
      return [{ to: HOST.application, event }];
    },
  });
}

/**
 * Starts the registered early systems (`system.early`), which the app runs before hydration and outside the bus,
 * and delivers them the messages sent to their refs, which the app's bus skips. Returns each one's actor, what
 * `createAppBus` needs (their refs, and `connected`, which it calls on each client connection once it has taken it),
 * and the stop for all of them.
 */
export function startEarlySystems(registry: Pick<PackRegistry, 'getEarlySystems'>): {
  actors: Array<{ id: FeatureRef; actor: AnyActorRef }>;
  stop(): void;
} & EarlySystems {
  const actors = registry.getEarlySystems().map(({ id, machine }) => ({ id, actor: createActor(machine).start() as AnyActorRef }));
  const unsubscribes = [
    _rootEvents.onIncoming(({ to, event }) => actors.find(({ id }) => id === to)?.actor.send(event)),
  ];
  return {
    actors,
    refs: new Set(actors.map(({ id }) => id)),
    connected: () => actors.forEach(({ actor }) => actor.send({ type: 'CLIENT_CONNECTED' })),
    stop: () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe());
      actors.forEach(({ actor }) => actor.stop());
    },
  };
}
