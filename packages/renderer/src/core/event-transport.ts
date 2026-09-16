import { registerHostModule } from '@abuddy/sdk/runtime';
import type { EventTransport, IncomingSystemEvents } from '@abuddy/sdk/events';
import { trpc } from '@/core/trpc';
import { globalToast } from '@/core/toast';

const backendOnly = (name: string) => () => {
  throw new Error(`${name} is only available to backend code`);
};

/**
 * A failed send is reported, not rethrown: an unhandled rejection would show the error page. The report
 * names the event's system and type only, since its payload can carry user data.
 */
function reportSendFailure(event: IncomingSystemEvents, error: unknown) {
  const reason = error instanceof Error ? error.message : String(error);
  const message = `Couldn't send ${event.type} to ${event.systemId}: ${reason}`;
  console.error(`[event-transport] ${message}`);
  window.electronAPI?.rendererLog?.write({
    level: 'error',
    source: 'event-transport',
    message,
    stack: error instanceof Error ? error.stack : undefined,
  }).catch(() => {});
  globalToast.error('Something went wrong', message);
}

/** How `@abuddy/sdk/events` sends in the renderer: events for systems go over the API client */
export const eventTransport: EventTransport = {
  sendIncoming: (event) => {
    trpc.bus.send.mutate(event).catch((error: unknown) => reportSendFailure(event, error));
  },
  sendOutgoing: backendOnly('sendToPlugin'),
  onConnected: backendOnly('onConnected'),
  onIncoming: backendOnly('onIncoming'),
};

// Registered as this module loads, before any plugin or pack frontend can send
registerHostModule('event-transport', eventTransport);
