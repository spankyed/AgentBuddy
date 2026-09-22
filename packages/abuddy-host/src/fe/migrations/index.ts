/**
 * The window's own migrations: what a window keeps in its storage, moved forward when the app it belongs to is
 * newer than the data. They run before the shell is created, since the shell reads those keys as it starts, and
 * they are the frontend counterpart of the app's migrations (`@abuddy/host/migrations`) — separate versioned
 * files, listed here, run in version order, each idempotent because a window may run them again.
 *
 * The storage arrives as `WindowStorage` (a window passes its `localStorage`), so this decides what moves and the
 * window supplies where it is kept.
 */
import { compareVersions } from '@abuddy/sdk/utils/compare-versions';
import { migration as m0315 } from './0.3.15.ts';

/** What a window keeps its own data in: `localStorage`'s shape, so a window passes it as it is */
export interface WindowStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface FrontendMigration {
  /** The app version this targets: it runs when the stored version is older */
  target: string;
  description: string;
  up: (storage: WindowStorage) => void;
}

/** The app version a window's storage was last migrated to */
const VERSION_KEY = 'agentbuddy-fe-version';

/** In version order */
const migrations: FrontendMigration[] = [m0315];

/** Runs every migration newer than what `storage` was last migrated to, then records `appVersion` */
export function runFrontendMigrations(storage: WindowStorage, appVersion: string): void {
  const current = storage.getItem(VERSION_KEY) || '0.0.0';

  for (const m of migrations) {
    if (compareVersions(m.target, current) > 0) {
      console.log(`[frontend-migration] Running ${m.target}: ${m.description}`);
      m.up(storage);
    }
  }

  if (current !== appVersion) storage.setItem(VERSION_KEY, appVersion);
}
