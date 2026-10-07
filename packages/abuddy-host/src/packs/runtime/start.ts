// The packs' start over hydrated data, as a boot and an app reset (services.appData.reset()) run it
import { runAppMigrations, runPackMigrations } from '../../migrations/index.ts';
import type { PackRegistry } from '../registry.ts';
import { seedPacks } from './seed.ts';

/** Each registered pack's onInit, then the app's and the external packs' migrations, then every pack's seeds, unless the app's migrations failed */
export function startPacks(registry: PackRegistry): void {
  for (const hooks of registry.getBootHooks()) hooks.onInit?.();

  // The versions and seed hashes the packs' migrations and seeds read may only be in place once the app's migrations
  // ran: when one failed, nothing else runs, and the next boot retries
  if (!runAppMigrations(registry)) return;
  const loadedPacks = registry.packTargets();
  if (loadedPacks.length > 0) runPackMigrations(loadedPacks);

  // One call for every pack, in dependency order, so every pack gets the same treatment: a failed seed is
  // retried on the next boot, and a pack sees what the packs it depends on seeded in this same run
  seedPacks(registry.packSeedTargets());
}
