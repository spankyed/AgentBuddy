import { settingsQueries, settingsCommands } from '@/systems/settings/repository';

export interface Migration {
  version: string;
  description: string;
  up: () => void;
}

// Register migrations in version order
import { migration as m020 } from './0.2.0';

const migrations: Migration[] = [m020];

export function runMigrations(): void {
  const current = settingsQueries.getInternalSettings().version || '0.0.0';

  for (const m of migrations) {
    if (m.version > current) {
      console.log(`[migration] Running ${m.version}: ${m.description}`);
      m.up();
      settingsCommands.updateSettings('internal', null, ['version'], m.version);
    }
  }
}
