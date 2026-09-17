// Opens this data dir's database for the db scripts, the way the API boots it: built-in packs
// registered (from their dev entries: the scripts run unbundled) and LMDB hydrated. Needs
// ABUDDY_ENV and ABUDDY_USER_DATA_DIR, like any process that touches app data.
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EARS } from '@abuddy/sdk';
import { openAppStore } from '@/setup/backend';
import { loadBuiltInPacks } from '@abuddy/host/packs/runtime';

export const packagesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** The data dir's LMDB store, the engine persisting to it and the registered packs, opened as the API opens them (the engine is installed) */
export const { store, engine, packs } = openAppStore();

/** Registers the built-in packs and hydrates the store, as the app's boot does; `hydrate: false` leaves LMDB untouched (e.g. before a reset) */
export async function openDatabase({ hydrate = true } = {}): Promise<void> {
  await loadBuiltInPacks(packs, packagesDir, { runtimeEntry: 'only' });
  if (hydrate) await store.hydrate();
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

/** An entity type registered by a pack, by name (the scripts don't import pack sources) */
export const entity = (name: string) => name as EARS.Entity;
