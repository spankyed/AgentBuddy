import * as fs from 'node:fs';
import * as path from 'node:path';
import { findPackRoot } from '../utils';

const CLEAN_DIRS = ['dist', '.abuddy', 'src/__generated__'];

export async function clean(_args: string[]) {
  const root = findPackRoot(process.cwd());

  let removed = 0;
  for (const dir of CLEAN_DIRS) {
    const fullPath = path.join(root, dir);
    if (fs.existsSync(fullPath)) {
      fs.rmSync(fullPath, { recursive: true, force: true });
      console.log(`  removed ${dir}/`);
      removed++;
    }
  }

  if (removed === 0) {
    console.log('  nothing to clean');
  } else {
    console.log(`\n  cleaned ${removed} director${removed === 1 ? 'y' : 'ies'}`);
  }
}
