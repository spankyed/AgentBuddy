import { repository } from '@/repository';
import { APP_VERSION } from '@/version';
import { getRegisteredMigrations } from '@/core/packs/pack-registration';
import type { LoadedPack } from '@/core/packs/pack-loader';

export function compareVersions(a: string, b: string): number {
  const [ax, bx] = [a, b].map(v => v.split('.').map(Number));
  for (let i = 0; i < Math.max(ax.length, bx.length); i++) {
    const diff = (ax[i] ?? 0) - (bx[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function runMigrations(): void {
  const current = repository.settingsQueries.getInternalSettings().version || '0.0.0';
  const migrations = getRegisteredMigrations().sort((a, b) => compareVersions(a.target, b.target));

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
    repository.settingsCommands.updateSettings('internal', null, ['version'], APP_VERSION);
  }
}

export function runPackMigrations(packs: LoadedPack[]): void {
  const stored = repository.settingsQueries.getInternalSettings().packVersions ?? {};
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
    repository.settingsCommands.updateSettings('internal', null, ['packVersions'], updated);
  }
}
