// The renderer's side of the SDK's frontend port (bindFeHost): the app shell, the secrets client, the window's client
// to the API, and the window's registered pack frontends
import { bindFeHost } from '@abuddy/sdk/runtime';
import type { HostShell } from '@abuddy/sdk/fe';
import { feClient } from '@/core/fe-client';
import { fePacks } from '@/core/fe-packs';
import { secretsClient } from '@/core/secrets-client';

/**
 * Binds the SDK's frontend port to this window's app, before the application actor is created (creating it already
 * builds its plugins' state) and before any pack frontend runs. `application` gives the actor once it exists.
 */
export function bindRendererHost(application: () => HostShell | undefined): void {
  bindFeHost({
    get application() {
      const actor = application();
      if (!actor) throw new Error("The application actor isn't created yet: SDK code reached it while the renderer was starting");
      return actor;
    },
    secrets: secretsClient,
    client: feClient,
    packs: fePacks,
  });
}
