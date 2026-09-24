// Seeds the `settings` entry (compiled by ../_compilers/settings.ts): importing it resets the user's settings to the
// defaults it holds. Keeping the existing data leaves them. The app's own state (AppState) isn't settings, so a reset
// leaves it alone.
import { services } from '@/__generated__/services';
import * as fs from 'node:fs';
import { seedPath } from '@abuddy/sdk/build';
import type { ImportCounts, ImportContext } from '@abuddy/sdk/utils';

export function apply(ctx: ImportContext): ImportCounts {
  const counts: ImportCounts = { created: 0, updated: 0, skipped: 0 };
  if (!fs.existsSync(seedPath(ctx.compiledDir, 'settings'))) {
    ctx.log('  settings artifact not found, skipping settings');
    return counts;
  }
  if (ctx.mode === 'keep-existing') {
    ctx.log('  settings skipped (existing)');
    counts.skipped = 1;
  } else {
    services.settings.reset();
    ctx.log('  settings reset to defaults');
    counts.updated = 1;
  }
  return counts;
}
