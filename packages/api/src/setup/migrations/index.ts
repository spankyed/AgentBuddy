import { settingsRepository } from '@abuddy/host/settings';
import { APP_VERSION } from '@/version';
import { compareVersions } from '@abuddy/sdk/utils';
import { getRegisteredMigrations } from '@abuddy/host/packs';
import { getBuiltInPackInfos, type LoadedPack } from '@/packs/pack-loader';

/**
 * Host migrations: the built-in packs' migrations, run when `stored app version < target <= APP_VERSION`.
 * External packs' migrations never run here; `runPackMigrations` runs them against each pack's own version.
 */
export function runMigrations(): void {
  const current = settingsRepository.settingsQueries.getInternalSettings().version || '0.0.0';
  const builtInPackIds = getBuiltInPackInfos().map(pack => pack.id);
  const migrations = getRegisteredMigrations(builtInPackIds).sort((a, b) => compareVersions(a.target, b.target));

  for (const m of migrations) {
    if (compareVersions(m.target, current) > 0 && compareVersions(m.target, APP_VERSION) <= 0) {
      console.log(`[migration] Running ${m.target}: ${m.description}`);
      try {
        m.up();
      } catch (error) {
        console.error(`[migration] FAILED ${m.target}: ${(error as Error).message}`);
        console.error((error as Error).stack);
      }
    }
  }

  if (current !== APP_VERSION) {
    settingsRepository.settingsCommands.updateSettings('internal', null, ['version'], APP_VERSION);
  }
}

/**
 * External packs' migrations, run when `stored pack version < target <= manifest version`,
 * recording each pack's version in internal settings `packVersions`.
 */
export function runPackMigrations(packs: LoadedPack[]): void {
  const stored = settingsRepository.settingsQueries.getInternalSettings().packVersions ?? {};
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
    settingsRepository.settingsCommands.updateSettings('internal', null, ['packVersions'], updated);
  }
}
