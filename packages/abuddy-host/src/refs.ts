// The app's own features, as the pack `host`: every host module names them from here. Pack code writes them as
// `'host/<feature>'`, which its generated types check. Frontend-safe: imports only `@abuddy/sdk/ids`.
import { HOST_PACK_ID, resolveName } from '@abuddy/sdk/ids';

export const HOST = {
  /** The root bus machine the app starts every system under: not a feature, but spelled as one */
  bus: resolveName('bus', HOST_PACK_ID),
  /** The app shell: its backend system keeps the shell's state, and the renderer's application actor is its plugin */
  application: resolveName('application', HOST_PACK_ID),
  /** Installing, updating and toggling packs: its system, and the renderer's Packs plugin */
  packs: resolveName('packs', HOST_PACK_ID),
  /** The app's settings: the store's system, and the renderer's Settings plugin */
  settings: resolveName('settings', HOST_PACK_ID),
} as const;
