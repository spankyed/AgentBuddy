// The app's migrations runners: the host runs them at boot, and again in an app reset
// (services.appData.reset()). The migrations live with their packs, and the host's own (the app's
// state) in ./app. The versions they ran to are recorded in AppState.
import { getAppVersion, parseAppEnv } from '@abuddy/sdk/env';
import { compareVersions } from '@abuddy/sdk/utils';
import type { PackMigration } from '@abuddy/sdk/framework';
import { appState } from '../app-state/index.ts';
import { appMigrations } from './app/index.ts';
import type { PackRegistry } from '../packs/pack-registration.ts';
import { getBuiltInPackInfos } from '../packs/runtime/loader.ts';
import type { LoadedPack } from '../packs/runtime/loaded-packs.ts';

/** A version without its prerelease part: a beta (`0.3.15-beta.2`) runs its release's (`0.3.15`) migrations */
const releaseOf = (version: string): string => version.replace(/[-+].*$/, '');

/**
 * The highest target the app runs, or none: a development build runs every pending migration, since
 * migrations are written for the release it's building towards
 */
function targetCap(appVersion: string): string | undefined {
  return parseAppEnv(process.env.ABUDDY_ENV) === 'development' ? undefined : releaseOf(appVersion);
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
  const builtInPackIds = getBuiltInPackInfos().map(pack => pack.id);
  if (!runPending(registry.getRegisteredMigrations(builtInPackIds), current, cap, '')) return false;

  if (appState.get().version !== appVersion) appState.update({ version: appVersion });
  return true;
}

/**
 * External packs' migrations, run when `stored pack version < target <= manifest version`,
 * recording each pack's version in AppState `packVersions`. Run after `runAppMigrations`, which moves the
 * versions recorded before AppState.
 */
export function runPackMigrations(packs: LoadedPack[]): void {
  const stored = appState.get().packVersions;
  const updated = { ...stored };
  let anyChanged = false;

  for (const pack of packs) {
    if (!pack.migrations?.length) continue;
    const currentVersion = stored[pack.manifest.id] || '0.0.0';
    const targetVersion = pack.manifest.version;
    if (compareVersions(currentVersion, targetVersion) >= 0) continue;

    const sorted = [...pack.migrations].sort((a, b) => compareVersions(a.target, b.target));
    let failed = false;
    for (const m of sorted) {
      if (compareVersions(m.target, currentVersion) > 0 && compareVersions(m.target, targetVersion) <= 0) {
        console.log(`[migration:${pack.manifest.id}] Running ${m.target}: ${m.description}`);
        try {
          m.up();
        } catch (error) {
          console.error(`[migration:${pack.manifest.id}] FAILED ${m.target}: ${(error as Error).message}`);
          failed = true;
          break;
        }
      }
    }

    if (!failed) {
      updated[pack.manifest.id] = targetVersion;
      anyChanged = true;
    }
  }

  const installedIds = new Set(packs.map(p => p.manifest.id));
  for (const id of Object.keys(updated)) {
    if (!installedIds.has(id)) { delete updated[id]; anyChanged = true; }
  }

  if (anyChanged) {
    appState.update({ packVersions: updated });
  }
}
