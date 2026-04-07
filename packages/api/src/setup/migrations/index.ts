import { settingsQueries, settingsCommands } from '@/systems/settings/repository';
import { APP_VERSION } from '@/version';

export interface Migration {
  target: string;
  description: string;
  up: () => void;
}

// Register migrations in version order
import { migration as m010 } from './0.1.0';

const migrations: Migration[] = [m010];

export function runMigrations(): void {
  let current = settingsQueries.getInternalSettings().version || '0.0.0';

  // Legacy normalization: users who ran pre-release builds had phantom
  // version strings from old defaults.ts (before migration system existed).
  // These users have never run any migrations, so reset to force all to run.
  // Safe because all migrations are idempotent.
  if (current === '0.1.0' || current === '0.2.0') {
    current = '0.0.0';
  }

  for (const m of migrations) {
    if (m.target > current) {
      console.log(`[migration] Running ${m.target}: ${m.description}`);
      m.up();
    }
  }

  // Stamp current app version after all migrations
  if (current !== APP_VERSION) {
    settingsCommands.updateSettings('internal', null, ['version'], APP_VERSION);
  }
}
