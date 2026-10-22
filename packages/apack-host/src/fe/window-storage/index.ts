/**
 * The window's own migrations: what a window keeps in its storage, moved forward when the app it belongs to is
 * newer than the data. They run before the shell is created, since the shell reads those keys as it starts, and
 * they are the frontend counterpart of the app's migrations (`@apackdev/host/migrations`) — separate versioned
 * files, listed here, run in version order, each idempotent because a window may run them again.
 *
 * The storage arrives as `WindowStorage` (a window passes its `localStorage`), so this decides what moves and the
 * window supplies where it is kept.
 *
 * **Host keys only.** A pack's keys are namespaced by its surface's ref (`surfaceStorage`,
 * `@apackdev/sdk/fe`), and a pack moving its own names would run at registration rather than here — late
 * enough to have the pack's code, early enough to precede its components. Nothing wants that yet:
 * `docs/plans/deferred/pack-window-storage-migrations.md`.
 */
import { compareVersions } from '@apackdev/sdk/utils/compare-versions';

/** What a window keeps its own data in: `localStorage`'s shape, so a window passes it as it is */
export interface WindowStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface WindowStorageMigration {
  /** The app version this targets: it runs when the stored version is older */
  target: string;
  description: string;
  up: (storage: WindowStorage) => void;
}

/** The app version a window's storage was last migrated to */
const VERSION_KEY = 'apack-window-storage-version';

/**
 * In version order, and **empty on purpose.** The app has never shipped, so no window holds a key under a
 * name this repo has since changed: the rename that would have needed the first entry simply renamed the
 * keys. The runner stays because the seam is the cheap half — an entry costs a file and a line here — and
 * because the version it records is what a first real migration compares against.
 */
const migrations: WindowStorageMigration[] = [];

/** Runs every migration newer than what `storage` was last migrated to, then records `appVersion` */
export function runWindowStorageMigrations(storage: WindowStorage, appVersion: string): void {
  const current = storage.getItem(VERSION_KEY) || '0.0.0';

  for (const m of migrations) {
    if (compareVersions(m.target, current) > 0) {
      console.log(`[frontend-migration] Running ${m.target}: ${m.description}`);
      m.up(storage);
    }
  }

  if (current !== appVersion) storage.setItem(VERSION_KEY, appVersion);
}
