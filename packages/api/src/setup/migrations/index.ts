import { settingsQueries, settingsCommands } from '@/systems/settings/repository';
import { APP_VERSION } from '@/version';

export interface Migration {
  target: string;
  description: string;
  up: () => void;
}

// Register migrations in version order
import { migration as m010 } from './0.1.0';
import { migration as m020 } from './0.2.0';
import { migration as m023 } from './0.2.3';

const migrations: Migration[] = [m010, m020, m023];

/** Compare dot-separated numeric versions. Returns <0, 0, >0. */
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

  for (const m of migrations) {
    // Run only if target is ahead of stored version AND not ahead of current app version
    if (compareVersions(m.target, current) > 0 && compareVersions(m.target, APP_VERSION) <= 0) {
      console.log(`[migration] Running ${m.target}: ${m.description}`);
      m.up();
    }
  }

  // Stamp current app version after all migrations
  if (current !== APP_VERSION) {
    settingsCommands.updateSettings('internal', null, ['version'], APP_VERSION);
  }
}
