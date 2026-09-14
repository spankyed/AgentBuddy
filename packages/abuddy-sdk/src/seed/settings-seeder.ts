import * as fs from 'fs';
import { builtinRepository } from '../ears/builtin-repositories.ts';
import type { Seeder, SeederContext, SeedCounts } from '../utils/index.ts';
import { seedPath } from '../build/manifest.ts';

export function createSettingsSeeder(): Seeder {
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
        builtinRepository.settingsCommands.resetSettings();
        ctx.log('  settings reset to defaults');
        counts.updated = 1;
      }
      return counts;
    },
  };
}
