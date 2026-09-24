// Opens this data dir's database for fix-prod-upgrade.ts, the way the API boots it: built-in packs
// registered (from their dev entries: the script runs unbundled) and LMDB hydrated, so it can run
// their seed code. Needs ABUDDY_ENV and ABUDDY_USER_DATA_DIR, like any process that touches app data.
// Database work that runs no pack code goes through `abuddy db` instead.
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openAppStore } from '@/runtime';
import { loadBuiltInPacks } from '@abuddy/host/packs/runtime';

export const packagesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** The data dir's LMDB store, the engine persisting to it and the registered packs, opened as the API opens them (the engine is installed) */
export const { store, engine, packs } = openAppStore();

/** Registers the built-in packs and hydrates the store, as the app's boot does */
export async function openDatabase(): Promise<void> {
  await loadBuiltInPacks(packs, packagesDir, { runtimeEntry: 'only' });
  await store.hydrate();
}

/** How many LMDB writes have failed in this process so far (the adapter logs a failed flush and carries on) */
export function persistenceErrorCount(): number {
  return store.sink.getErrorStats?.().errorCount ?? 0;
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
  store.close();
}
