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

/**
 * Registers the built-in packs; `hydrate: false` leaves LMDB untouched (e.g. before a reset).
 * `skipTombstoneScan: true` hydrates tombstoned entities' rows too, as the app's boot does (setup/backend.ts).
 */
export async function openDatabase({ hydrate = true, skipTombstoneScan = false } = {}): Promise<void> {
  await loadBuiltInPacks(packagesDir, { runtimeEntry: 'only' });
  if (hydrate) await hydrateSharded({ envs, policy, shardedPersistence: persistence, skipTombstoneScan });
}

/** How many LMDB writes have failed in this process so far (the adapter logs a failed flush and carries on) */
export function persistenceErrorCount(): number {
  return persistence.getErrorStats?.().errorCount ?? 0;
}

/**
 * Waits for the writes buffered so far to be flushed to LMDB (the adapter flushes in a microtask) and
 * returns the failed-write count after it, so a script can check it before closeDatabase.
 */
export async function flushDatabase(): Promise<number> {
  await new Promise<void>((resolve) => setImmediate(resolve));
  return persistenceErrorCount();
}

export function closeDatabase(): void {
  closePersistence();
}

/** An entity type registered by a pack, by name (the scripts don't import pack sources) */
export const entity = (name: string) => name as EARS.Entity;

export { envs };
