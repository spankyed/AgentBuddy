// The app's bus: the bus machine wired to the app's root event bus (the api's tRPC clients), which the
// SDK reaches through the bound HostRuntime's transport.
import { _rootEvents } from '@apack/sdk/runtime';
import type { HostPluginEvents } from '@apack/sdk/events';
import { appState } from '../app-state/index.ts';
import type { PackRegistry } from '../packs/registry.ts';
import { getPacksWithClientLoadedFrontends } from '../packs/layout.ts';
import { createBusMachine } from './machine.ts';
import { pluginVisibility } from '../features/application/be/system.ts';
import { HOST } from '../refs.ts';
import type { ParticipantClaims } from './participants.ts';

/** Sent to the application plugin after each client connection: the app shell's state, which the window opens with */
export type ApplicationConnectedEvent = Extract<HostPluginEvents['host/application'], { type: 'CLIENT_CONNECTED' }>;

/** The app's bus: the systems in `registry`, and clients over the root event bus on the shared bus core */
export function createAppBus(registry: PackRegistry, claims?: ParticipantClaims) {
  return createBusMachine({
    registry,
    participantClient: claims && ((ref) => claims.clientFor(ref)),
    onOutgoing: (message) => _rootEvents.emitOutgoing(message),
    listen: (send) => {
      const unsubscribes = [
        _rootEvents.onConnected(() => send({ type: 'CLIENT_CONNECTED' })),
        _rootEvents.onPackClientConnected((packId) => send({ type: 'PACK_CLIENT_CONNECTED', packId })),
        // Sends to plugins from outside a system go through the bus, which drops them until a client connects
        _rootEvents.onPluginSend((message) => send({ type: 'OUTGOING', message })),
        _rootEvents.onIncoming((message) => send({ type: 'INCOMING', message })),
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

