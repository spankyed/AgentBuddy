// The app's migrations runners: the host runs them at boot, and again in an app reset
// (services.appData.reset()). Migrations live with their packs; versions are recorded in AppState.
import { getAppVersion, resolveAppEnvironment } from '@apackdev/sdk/env';
import { compareVersions } from '@apackdev/sdk/utils';
import type { PackMigration } from '@apackdev/sdk/framework';
import { appState } from '../app-state/index.ts';
import type { PackRegistry } from '../packs/registry.ts';

/** A version without its prerelease part: a beta (`0.4.0-beta.2`) runs its release's (`0.4.0`) migrations */
const releaseOf = (version: string): string => version.replace(/[-+].*$/, '');

/**
 * The highest target the app runs, or none: a development build runs every pending migration, since
 * migrations are written for the release it's building towards
 */
function targetCap(appVersion: string): string | undefined {
  return resolveAppEnvironment().env === 'development' ? undefined : releaseOf(appVersion);
}

/**
 * Runs each migration with `stored < target <= cap`, in version order, and stops at the first that fails.
 * Returns whether all of them ran.
 */
function runPending(migrations: readonly PackMigration[], stored: string, cap: string | undefined, label: string): boolean {
  for (const m of [...migrations].sort((a, b) => compareVersions(a.target, b.target))) {
    if (compareVersions(m.target, stored) <= 0) continue;
    if (cap !== undefined && compareVersions(m.target, cap) > 0) continue;
    console.log(`[migration${label}] Running ${m.target}: ${m.description}`);
    try {
      m.up();
    } catch (error) {
      console.error(`[migration${label}] FAILED ${m.target}, skipping the rest: ${(error as Error).message}`);
      console.error((error as Error).stack);
      return false;
    }
  }
  return true;
}

/**
 * Every registered pack's `app` migrations, each run when
 * `stored app version < target <= app version` (`getAppVersion()`, the bound runtime's). A prerelease counts as
 * its release; a development build runs every pending migration. Nothing runs again while the recorded version
 * is the app's, except in development.
 *
 * **Which packs' is a question this no longer asks.** A pack says which line each of its migrations is on
 * (`apack.json`'s `migrations.app`), so a pack the app ships is here for the same reason an external one
 * is — it declared one — rather than for having been shipped. The pack line is `runPackMigrations`.
 *
 * Data without a recorded version is new and at the app version; no pack app-line migration runs.
 *
 * A failed migration stops the rest and leaves the recorded version as it was, so the next boot retries from it.
 * Returns whether every migration ran.
 */
export function runAppMigrations(registry: PackRegistry): boolean {
  const appVersion = getAppVersion();
  const cap = targetCap(appVersion);
  const recorded = appState.get().version;
  if (cap !== undefined && recorded === appVersion) return true;

  const current = appState.get().version ?? appVersion;
  const packsOnAppLine = registry.packMigrationTargets('app').flatMap(({ migrations }) => migrations ?? []);
  if (!runPending(packsOnAppLine, current, cap, '')) return false;

  if (appState.get().version !== appVersion) appState.update({ version: appVersion });
  return true;
}

/** An admitted owner's app-line callbacks; the app supplies their version cap. */
export interface AppMigrationTarget {
  readonly packId: string;
  readonly migrations?: readonly PackMigration[];
}

/** An admitted owner's pack-line callbacks and its independently declared version cap. */
export interface PackMigrationTarget extends AppMigrationTarget {
  readonly version: string;
}

/**
 * Packs' `pack`-line migrations, each pack's run when `stored pack version < target <= declared pack version`,
 * recording the pack's version in AppState `packVersions` once they all ran. Run after `runAppMigrations`,
 * which records the app version. A pack that is not loaded (disabled) keeps its recorded version.
 */
export function runPackMigrations(packs: Iterable<PackMigrationTarget>): void {
  const packVersions = { ...appState.get().packVersions };
  let changed = false;

  for (const { packId, version, migrations } of packs) {
    if (!migrations?.length) continue;
    const stored = Object.hasOwn(packVersions, packId) ? packVersions[packId] : '0.0.0';
    if (compareVersions(stored, version) >= 0) continue;
    if (!runPending(migrations, stored, version, `:${packId}`)) continue;
    packVersions[packId] = version;
    changed = true;
  }

  if (changed) appState.update({ packVersions });
}
