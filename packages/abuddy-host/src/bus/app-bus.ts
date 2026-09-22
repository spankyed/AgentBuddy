// The app's bus: the bus machine wired to the app's root event bus (the api's tRPC clients), which the
// SDK reaches through the bound HostRuntime's transport.
import { createActor, type AnyActorRef } from 'xstate';
import { _rootEvents } from '@abuddy/sdk/runtime';
import type { FeatureRef } from '@abuddy/sdk/ids';
import { appState } from '../app-state/index.ts';
import type { PackRegistry } from '../packs/pack-registration.ts';
import { getPacksWithClientLoadedFrontends } from '../packs/pack-layout.ts';
import { createBusMachine } from './machine.ts';
import { application, pluginVisibility } from './application-system.ts';

/** Sent to the application plugin after each client connection: the app shell's state, which the window opens with */
export type ApplicationConnectedEvent = {
  type: 'CLIENT_CONNECTED';
  hasOnboarded: boolean;
  pluginVisibility: Record<string, boolean>;
  lastActivePlugin?: string;
};

/** The app's bus: the systems in `registry`, clients over the root event bus on the shared bus core */
export function createAppBus(registry: PackRegistry) {
  return createBusMachine({
    registry,
    onOutgoing: (message) => _rootEvents.emitOutgoing(message),
    listen: (send) => {
      const unsubscribes = [
        _rootEvents.onConnected(() => send({ type: 'CLIENT_CONNECTED' })),
        _rootEvents.onPackClientConnected((packId) => send({ type: 'PACK_CLIENT_CONNECTED', packId })),
        // Sends to plugins from outside a system go through the bus, which drops them until a client connects
        _rootEvents.onPluginSend((message) => send({ type: 'OUTGOING', message })),
        _rootEvents.onIncoming((message) => {
          // An early system runs outside the bus and gets its messages from `startEarlySystems`
          if (!registry.getEarlySystems().some(({ id }) => id === message.to)) send({ type: 'INCOMING', message });
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
      return [{ to: application, event }];
    },
  });
}

/**
 * Starts the registered early systems (`system.early`), which the app runs before hydration and outside the bus,
 * and delivers them what the bus delivers every other system: the messages sent to their refs, which the app's bus
 * skips, and CLIENT_CONNECTED on each client connection. Returns each one's actor, and the stop for all of them.
 */
export function startEarlySystems(registry: Pick<PackRegistry, 'getEarlySystems'>): { actors: Array<{ id: FeatureRef; actor: AnyActorRef }>; stop(): void } {
  const actors = registry.getEarlySystems().map(({ id, machine }) => ({ id, actor: createActor(machine).start() as AnyActorRef }));
  const unsubscribes = [
    _rootEvents.onIncoming(({ to, event }) => actors.find(({ id }) => id === to)?.actor.send(event)),
    _rootEvents.onConnected(() => actors.forEach(({ actor }) => actor.send({ type: 'CLIENT_CONNECTED' }))),
  ];
  return {
    actors,
    stop: () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe());
      actors.forEach(({ actor }) => actor.stop());
    },
  };
}
