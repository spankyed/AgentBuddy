import type { EventTransport } from '@abuddy/sdk/events';
import { rootEvents } from '@/core/router/bus-emitter';

/** How `@abuddy/sdk/events` sends in the API process: straight onto the root event bus */
export const eventTransport: EventTransport = {
  sendIncoming: (event) => rootEvents.emitIncoming(event),
  sendOutgoing: (event) => rootEvents.emitOutgoing(event),
  onConnected: (callback) => rootEvents.onConnected(callback),
  onIncoming: (callback) => rootEvents.onIncoming(callback),
};
