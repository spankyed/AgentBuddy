import { repository } from '@/repository';
import { APP_VERSION } from '@/version';
import { getRegisteredMigrations } from '@/core/packs/pack-registration';

const { settingsQueries, settingsCommands } = repository;

function compareVersions(a: string, b: string): number {
  const [ax, bx] = [a, b].map(v => v.split('.').map(Number));
  for (let i = 0; i < Math.max(ax.length, bx.length); i++) {
    const diff = (ax[i] ?? 0) - (bx[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function runMigrations(): void {
  const current = settingsQueries.getInternalSettings().version || '0.0.0';
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
    settingsCommands.updateSettings('internal', null, ['version'], APP_VERSION);
  }
}
