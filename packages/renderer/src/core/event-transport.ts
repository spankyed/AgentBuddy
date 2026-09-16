import { registerHostModule } from '@abuddy/sdk/runtime';
import type { EventTransport } from '@abuddy/sdk/events';
import { trpc } from '@/core/trpc';
import { globalToast } from '@/core/toast';

const backendOnly = (name: string) => () => {
  throw new Error(`${name} is only available to backend code`);
};

/** How `@abuddy/sdk/events` sends in the renderer: events for systems go over the API client */
export const eventTransport: EventTransport = {
  sendIncoming: (event) => {
    // Caught, since an unhandled rejection shows the error page. The report leaves out the payload, and goes to
    // the app's log (and so diagnostics) as well as the console
    trpc.bus.send.mutate(event).catch((error: unknown) => {
      const message = `Couldn't send ${event.type} to ${event.systemId}: ${error instanceof Error ? error.message : String(error)}`;
      console.error(`[event-transport] ${message}`);
      window.electronAPI?.rendererLog?.write({ level: 'error', source: 'event-transport', message }).catch(() => {});
      globalToast.error(message);
    });
  },
  sendOutgoing: backendOnly('sendToPlugin'),
  onConnected: backendOnly('onConnected'),
  onIncoming: backendOnly('onIncoming'),
};

// Registered as this module loads, before any plugin or pack frontend can send
registerHostModule('event-transport', eventTransport);
