// Opens this data dir's database for the db scripts, the way the API boots it: built-in packs
// registered (from their dev entries: the scripts run unbundled) and LMDB hydrated. Needs
// ABUDDY_ENV and ABUDDY_USER_DATA_DIR, like any process that touches app data.
import '@/setup/sdk-host-init';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EARS } from '@abuddy/sdk';
import { hydrateSharded } from '@/core/persistence/partitioning/hydrate-sharded';
import { envs, policy, persistence, closePersistence } from '@/core/ears/attribute-storage';
import { loadBuiltInPacks } from '@/packs/pack-loader';

export const packagesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** Registers the built-in packs; `hydrate: false` leaves LMDB untouched (e.g. before a reset). */
export async function openDatabase({ hydrate = true } = {}): Promise<void> {
  await loadBuiltInPacks(packagesDir, { runtimeEntry: 'only' });
  if (hydrate) await hydrateSharded({ envs, policy, shardedPersistence: persistence });
}

export function closeDatabase(): void {
  closePersistence();
}

/** An entity type registered by a pack, by name (the scripts don't import pack sources) */
export const entity = (name: string) => name as EARS.Entity;

export { envs };
