import { buildRegisteredEventValidationMap } from '@abuddy/host/packs';
import { createBusMachine, type IncomingSystemEvents, type OutgoingSystemEvents as BusOutgoingEvents } from '@abuddy/host/bus';
import type { ApplicationOutgoingEvents } from '@/core/shared/system-errors';
import type { SystemEvents } from '@abuddy/sdk/framework';
import { rootEvents } from '@/core/router/bus-emitter';
import { settingsRepository } from '@abuddy/host/settings';
import { getDesignated, hasDesignation } from '@abuddy/sdk';
import { getPacksWithClientLoadedFrontends } from '@/packs/pack-api';

export type {
  BackendEvents,
  BusEvent,
  ReloadPackEvent,
  TeardownPackEvent,
  ActivatePackEvent,
  PackClientConnectedEvent,
  SystemsSpawnedEvent,
} from '@abuddy/host/bus';
export type { IncomingSystemEvents, SystemEvents };
export type OutgoingSystemEvents = BusOutgoingEvents | ApplicationOutgoingEvents;

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

/** The app's bus: clients over tRPC (rootEvents) on the shared bus core */
export const backendSystem = createBusMachine({
  onOutgoing: (event) => rootEvents.emitOutgoing(event),
  listen: (send) => {
    const unsubscribes = [
      rootEvents.onConnected(() => send({ type: 'CLIENT_CONNECTED' })),
      rootEvents.onPackClientConnected((packId) => send({ type: 'PACK_CLIENT_CONNECTED', packId })),
      rootEvents.onIncoming((event) => {
        // The logs system reads log events directly; the bus doesn't route them
        if (!hasDesignation('logs') || event.systemId !== getDesignated('logs')) send({ type: 'INCOMING', event });
      }),
    ];
    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  },
  // Each client asks for these packs' startup data once it has tried loading their frontends (bus.packClientReady)
  clientLoadedPacks: getPacksWithClientLoadedFrontends,
  connectedEvents: () => [{
    type: 'CLIENT_CONNECTED',
    hasOnboarded: settingsRepository.settingsQueries.getInternalSettings().hasOnboarded,
    pluginId: 'application',
  }],
});
