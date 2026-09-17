// The renderer's side of the SDK's frontend port (bindFeHost): the application actor, the secrets client, sends to
// backend systems over the API client, and the window's registered pack frontends
import type { AnyActorRef } from 'xstate';
import { bindFeHost, type FeTransport } from '@abuddy/sdk/runtime';
import { createFePackRegistry } from '@abuddy/host/fe';
import { trpc } from '@/core/trpc';
import { globalToast } from '@/core/toast';
import { secretsClient } from '@/core/secrets-client';

/** How `@abuddy/sdk/events` sends in the renderer: events for systems go over the API client */
export const feTransport: FeTransport = {
  sendIncoming: (event) => {
    // Caught, since an unhandled rejection shows the error page. The report leaves out the payload, and goes to
    // the app's log (and so diagnostics) as well as the console
    trpc.bus.send.mutate(event).catch((error: unknown) => {
      const message = `Couldn't send ${event.type} to ${event.systemId}: ${error instanceof Error ? error.message : String(error)}`;
      console.error(`[fe-host] ${message}`);
      window.electronAPI?.rendererLog?.write({ level: 'error', source: 'fe-host', message }).catch(() => {});
      globalToast.error(message);
    });
  },
};

/**
 * This window's registered pack frontends: the built-in packs' (main.ts) and the external packs' the pack loader
 * loads. The SDK's frontend lookups (steps, designations, tiptap plugins, DSL types) read it once bound.
 */
export const fePacks = createFePackRegistry();

/**
 * Binds the SDK's frontend port to this window's app, before the application actor is created (creating it already
 * builds its plugins' state) and before any pack frontend runs. `application` gives the actor once it exists.
 */
export function bindRendererHost(application: () => AnyActorRef | undefined): void {
  bindFeHost({
    get application() {
      const actor = application();
      if (!actor) throw new Error("The application actor isn't created yet: SDK code reached it while the renderer was starting");
      return actor;
    },
    secrets: secretsClient,
    transport: feTransport,
    packs: fePacks,
  });
}
