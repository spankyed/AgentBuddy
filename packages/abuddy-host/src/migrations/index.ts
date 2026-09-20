// The app's migrations runners: the host runs them at boot, and again in an app reset
// (services.appData.reset()). The migrations live with their packs, and the host's own (the app's
// state) in ./app. The versions they ran to are recorded in AppState.
import { getAppVersion, resolveAppContext } from '@abuddy/sdk/env';
import { compareVersions } from '@abuddy/sdk/utils';
import type { PackMigration } from '@abuddy/sdk/framework';
import { appState } from '../app-state/index.ts';
import { appMigrations } from './app/index.ts';
import type { PackRegistry } from '../packs/pack-registration.ts';

/** A version without its prerelease part: a beta (`0.3.15-beta.2`) runs its release's (`0.3.15`) migrations */
const releaseOf = (version: string): string => version.replace(/[-+].*$/, '');

/**
 * The highest target the app runs, or none: a development build runs every pending migration, since
 * migrations are written for the release it's building towards
 */
function targetCap(appVersion: string): string | undefined {
  return resolveAppContext().env === 'development' ? undefined : releaseOf(appVersion);
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
 * The app's migrations: the host's own first, then the built-in packs' registered in `registry`, each run when
 * `stored app version < target <= app version` (`getAppVersion()`, the bound runtime's). A prerelease counts as
 * its release; a development build runs every pending migration. Nothing runs again while the recorded version
 * is the app's, except in development. External packs' migrations never run here; `runPackMigrations` runs them
 * against each pack's own version.
 *
 * Data without a recorded version runs the host's migrations (which move a version stored before AppState
 * existed); if there's still none, the data is new and at the app version, and no pack migration runs.
 *
 * A failed migration stops the rest and leaves the recorded version as it was, so the next boot retries from it.
 * Returns whether every migration ran.
 */
export function runAppMigrations(registry: PackRegistry): boolean {
  const appVersion = getAppVersion();
  const cap = targetCap(appVersion);
  const recorded = appState.get().version;
  if (cap !== undefined && recorded === appVersion) return true;

  if (!runPending(appMigrations(registry), recorded ?? '0.0.0', cap, ':app')) return false;

  const current = appState.get().version ?? appVersion;
  const builtInPackIds = registry.builtInPacks().map(pack => pack.id);
  if (!runPending(registry.getRegisteredMigrations(builtInPackIds), current, cap, '')) return false;

  if (appState.get().version !== appVersion) appState.update({ version: appVersion });
  return true;
}

/**
 * External packs' migrations, each pack's run when `stored pack version < target <= manifest version`, recording
 * the pack's version in AppState `packVersions` once they all ran. Run after `runAppMigrations`, which moves the
 * versions recorded before AppState. A pack that isn't loaded (disabled) keeps its recorded version.
 */
/** What running a pack's migrations needs: which pack, at which version, and the migrations */
export interface PackMigrationTarget {
  manifest: { id: string; version: string };
  migrations?: PackMigration[];
}

export function runPackMigrations(packs: Iterable<PackMigrationTarget>): void {
  const packVersions = { ...appState.get().packVersions };
  let changed = false;

  for (const { manifest, migrations } of packs) {
    if (!migrations?.length) continue;
    const stored = packVersions[manifest.id] || '0.0.0';
    if (compareVersions(stored, manifest.version) >= 0) continue;
    if (!runPending(migrations, stored, manifest.version, `:${manifest.id}`)) continue;
    packVersions[manifest.id] = manifest.version;
    changed = true;
  }

  if (changed) appState.update({ packVersions });
}
