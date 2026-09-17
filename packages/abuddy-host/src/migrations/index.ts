// The app's migrations runners: the host runs them at boot, and runAppMigrations again in an app reset
// (services.appData.reset()). The migrations live with their packs, and the host's own (the app's
// state) in ./app. The versions they ran to are recorded in AppState.
import { getAppVersion } from '@abuddy/sdk/env';
import { compareVersions } from '@abuddy/sdk/utils';
import type { PackMigration } from '@abuddy/sdk/framework';
import { appState } from '../app-state/index.ts';
import { appMigrations } from './app/index.ts';
import type { PackRegistry } from '../packs/pack-registration.ts';
import { getBuiltInPackInfos } from '../packs/runtime/loader.ts';
import type { LoadedPack } from '../packs/runtime/loaded-packs.ts';

/** Runs each migration with `stored < target <= app version`, in version order; a failed one is logged and the rest run */
function runPending(migrations: readonly PackMigration[], stored: string, appVersion: string, label: string): void {
  for (const m of [...migrations].sort((a, b) => compareVersions(a.target, b.target))) {
    if (compareVersions(m.target, stored) > 0 && compareVersions(m.target, appVersion) <= 0) {
      console.log(`[migration${label}] Running ${m.target}: ${m.description}`);
      try {
        m.up();
      } catch (error) {
        console.error(`[migration${label}] FAILED ${m.target}: ${(error as Error).message}`);
        console.error((error as Error).stack);
      }
    }
  }
}

/**
 * The app's migrations, run when `stored app version < target <= app version` (`getAppVersion()`, the bound
 * runtime's): the host's own first, then the built-in packs' registered in `registry`. External packs' migrations never run here;
 * `runPackMigrations` runs them against each pack's own version.
 *
 * Data without a recorded version runs the host's migrations (which move a version stored before AppState
 * existed); if there's still none, the data is new and at the app version, and no pack migration runs.
 */
export function runAppMigrations(registry: PackRegistry): void {
  const appVersion = getAppVersion();
  runPending(appMigrations(registry), appState.get().version ?? '0.0.0', appVersion, ':app');

  const current = appState.get().version ?? appVersion;
  const builtInPackIds = getBuiltInPackInfos().map(pack => pack.id);
  runPending(registry.getRegisteredMigrations(builtInPackIds), current, appVersion, '');

  if (appState.get().version !== appVersion) appState.update({ version: appVersion });
}

/**
 * External packs' migrations, run when `stored pack version < target <= manifest version`,
 * recording each pack's version in AppState `packVersions`.
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
