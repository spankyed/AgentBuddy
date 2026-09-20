// The packs' start over hydrated data, as a boot and an app reset (services.appData.reset()) run it
import { runAppMigrations, runPackMigrations } from '../../migrations/index.ts';
import type { PackRegistry } from '../pack-registration.ts';
import { orchestrateDeclarativeSeed, seedPackData } from './seed.ts';

/** Each registered pack's onInit, then the app's and the external packs' migrations, then the built-in and external packs' seeds, unless the app's migrations failed */
export function startPacks(registry: PackRegistry): void {
  for (const hooks of registry.getBootHooks()) hooks.onInit?.();

  // The versions and seed hashes the packs' migrations and seeds read may only be in place once the app's migrations
  // ran: when one failed, nothing else runs, and the next boot retries
  if (!runAppMigrations(registry)) return;
  const externalPacks = registry.externalPackTargets();
  if (externalPacks.length > 0) runPackMigrations(externalPacks);

  registry.runRegisteredBootSeeds(orchestrateDeclarativeSeed);
  if (externalPacks.length > 0) {
    seedPackData(externalPacks);
  }
}
