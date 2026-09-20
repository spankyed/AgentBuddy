// The app's bus: the bus machine wired to the app's root event bus (the api's tRPC clients), which the
// SDK reaches through the bound HostRuntime's transport.
import { _rootEvents } from '@abuddy/sdk/runtime';
import { getDesignated, hasDesignation } from '@abuddy/sdk/designations';
import { appState } from '../app-state/index.ts';
import type { PackRegistry } from '../packs/pack-registration.ts';
import { getPacksWithClientLoadedFrontends } from '../packs/pack-layout.ts';
import { createBusMachine } from './machine.ts';

/** Sent to the application plugin after each client connection */
export type ApplicationConnectedEvent = { type: 'CLIENT_CONNECTED'; hasOnboarded: boolean; pluginId: 'application' };

/** The app's bus: the systems in `registry`, clients over the root event bus on the shared bus core */
export function createAppBus(registry: PackRegistry) {
  return createBusMachine({
    registry,
    onOutgoing: (event) => _rootEvents.emitOutgoing(event),
    listen: (send) => {
      const unsubscribes = [
        _rootEvents.onConnected(() => send({ type: 'CLIENT_CONNECTED' })),
        _rootEvents.onPackClientConnected((packId) => send({ type: 'PACK_CLIENT_CONNECTED', packId })),
        // Sends to plugins from outside a system go through the bus, which drops them until a client connects
        _rootEvents.onPluginSend((event) => send({ type: 'OUTGOING', event })),
        _rootEvents.onIncoming((event) => {
          // The logs system reads log events directly; the bus doesn't route them
          if (!hasDesignation('logs') || event.systemId !== getDesignated('logs')) send({ type: 'INCOMING', event });
        }),
      ];
      return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
    },
    // Each client asks for these packs' startup data once it has tried loading their frontends (bus.packClientReady)
    clientLoadedPacks: () => getPacksWithClientLoadedFrontends(registry),
    connectedEvents: (): ApplicationConnectedEvent[] => [{
      type: 'CLIENT_CONNECTED',
      hasOnboarded: appState.get().hasOnboarded,
      pluginId: 'application',
    }],
  });
}
