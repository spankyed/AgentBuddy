import * as fs from 'fs';
import { repository } from '../ears/index';
import { type Seeder, type SeederContext, type SeedCounts } from '../utils/index';
import { seedPath } from '../build/manifest';

export function createSettingsSeeder(): Seeder {
  const repo = repository as any;

  return {
    key: 'settings',
    seed(ctx: SeederContext): SeedCounts {
      const counts: SeedCounts = { created: 0, updated: 0, skipped: 0 };
      const settingsFile = seedPath(ctx.compiledDir, 'settings');
      if (!fs.existsSync(settingsFile)) {
        ctx.log('  settings artifact not found, skipping settings');
        return counts;
      }
      if (ctx.mode === 'keep-existing') {
        ctx.log('  settings skipped (existing)');
        counts.skipped = 1;
      } else {
        repo.settingsCommands.resetSettings();
        ctx.log('  settings reset to defaults');
        counts.updated = 1;
      }
      return counts;
    },
  };
}
