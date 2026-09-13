import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';

/**
 * Extra resolve conditions for building pack code in `dir`. A pack linked to a checkout's
 * workspace @abuddy/sdk (not installed under node_modules) builds @abuddy/* packages from
 * source, like the monorepo's own tooling; an installed SDK resolves to its dist.
 *
 * @internal Host-only: abuddy CLI build tooling.
 */
export function sourceConditions(dir: string): string[] {
  try {
    const manifest = createRequire(path.join(dir, 'package.json')).resolve('@abuddy/sdk/package.json');
    return fs.realpathSync(manifest).split(path.sep).includes('node_modules') ? [] : ['@abuddy/source'];
  } catch {
    return [];
  }
}
