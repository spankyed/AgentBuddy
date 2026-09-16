import { registerHostModule } from '@abuddy/sdk/runtime';
import type { EventTransport } from '@abuddy/sdk/events';
import { trpc } from '@/core/trpc';

const backendOnly = (name: string) => () => {
  throw new Error(`${name} is only available to backend code`);
};

/** How `@abuddy/sdk/events` sends in the renderer: events for systems go over the API client */
export const eventTransport: EventTransport = {
  sendIncoming: (event) => { void trpc.bus.send.mutate(event); },
  sendOutgoing: backendOnly('sendToPlugin'),
  onConnected: backendOnly('onConnected'),
  onIncoming: backendOnly('onIncoming'),
};

// Registered as this module loads, before any plugin or pack frontend can send. The API client is
// registered too, for the SDK's own calls (`secretsClient` in `@abuddy/sdk/fe`).
registerHostModule('event-transport', eventTransport);
registerHostModule('trpc', { trpc });
