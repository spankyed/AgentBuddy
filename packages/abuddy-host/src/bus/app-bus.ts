// The app's bus: the bus machine wired to the app's root event bus (the api's tRPC clients), which the
// SDK reaches through the bound HostRuntime's transport.
import { _rootEvents } from '@abuddy/sdk/runtime';
import { getDesignated, hasDesignation } from '@abuddy/sdk/designations';
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
          // The logs system hears its own messages directly; the bus doesn't route them
          if (!hasDesignation('logs') || message.to !== getDesignated('logs')) send({ type: 'INCOMING', message });
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
