import { settingsQueries, settingsCommands } from '@/systems/settings/repository';
import { APP_VERSION } from '@/version';

export interface Migration {
  version: string;
  description: string;
  up: () => void;
}

// Register migrations in version order
import { migration as m003 } from './0.0.3';

const migrations: Migration[] = [m003];

export function runMigrations(): void {
  let current = settingsQueries.getInternalSettings().version || '0.0.0';

  // TODO: Remove after v0.0.3 — legacy normalization only needed for
  // users who ran pre-release builds with internal-only version strings.
  if (current === '0.1.0' || current === '0.2.0') {
    current = '0.0.0';
  }

  for (const m of migrations) {
    if (m.version > current) {
      console.log(`[migration] Running ${m.version}: ${m.description}`);
      m.up();
    }
  }

  // Stamp current app version after all migrations
  if (current !== APP_VERSION) {
    settingsCommands.updateSettings('internal', null, ['version'], APP_VERSION);
  }
}
