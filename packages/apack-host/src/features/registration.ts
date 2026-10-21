// The app's own features, registered as the pack `host` like any pack: so every registry lookup, validation map and
// sort treats them as it treats a pack's, with no side channel. The surfaces are always there; the systems only where
// the caller runs them (the app does; the test harness runs no Packs system).
import type { PackFeatureSystem, PackRegistration } from '@apackdev/sdk/framework';
import { HOST_PACK_ID } from '@apackdev/sdk/ids';
import { hostFeatureIds } from './declaration.ts';
import { helpSystem } from './help/be/system.ts';
import { hostEventContracts } from './event-contracts.ts';
import { up as moveSurfaceStateOffPluginNames } from '../migrations/app/0.4.0.ts';

/** The host's registration: its surfaces, and the systems in `systems` */
export function hostRegistration(systems: { application?: PackFeatureSystem; packs?: PackFeatureSystem; settings?: PackFeatureSystem } = {}): PackRegistration {
  return {
    id: HOST_PACK_ID,
    migrations: { app: [{
      target: '0.4.0',
      description: "Move AppState's surface visibility and last-active surface off their plugin names",
      up: moveSurfaceStateOffPluginNames,
    }] },
    features: {
      [hostFeatureIds.application]: { ...(systems.application && { system: systems.application }), surface: { receives: hostEventContracts.application.surface.receives } },
      [hostFeatureIds.help]: { system: { machine: helpSystem, receives: hostEventContracts.help.system.incoming } },
      [hostFeatureIds.packs]: { ...(systems.packs && { system: systems.packs }), surface: { receives: hostEventContracts.packs.surface.receives } },
      // The app's settings: the store's system, and the Settings view the renderer draws. It takes what its own
      // system sends, and what a pack may send it (`HOST_SURFACE_EVENT_TYPES`): only that pack can find those out.
      [hostFeatureIds.settings]: { ...(systems.settings && { system: systems.settings }), surface: { receives: hostEventContracts.settings.surface.receives } },
    },
  };
}
