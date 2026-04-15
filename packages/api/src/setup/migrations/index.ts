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

const migrations: Migration[] = [m010, m020];

export function runMigrations(): void {
  let current = settingsQueries.getInternalSettings().version || '0.0.0';

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
