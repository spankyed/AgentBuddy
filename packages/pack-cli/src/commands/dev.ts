import * as fs from 'node:fs';
import * as path from 'node:path';
import { build } from './build';

function findPackRoot(from: string): string {
  let dir = from;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'abuddy.json'))) return dir;
    dir = path.dirname(dir);
  }
  throw new Error('No abuddy.json found. Run this command from inside a pack directory.');
}

export async function dev(_args: string[]) {
  const root = findPackRoot(process.cwd());
  const watchDirs = [
    path.join(root, 'src'),
  ].filter(d => fs.existsSync(d));

  if (watchDirs.length === 0) {
    throw new Error('No src/ directory to watch');
  }

  console.log('Starting dev mode (watching for changes)...\n');

  await build([]);

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  for (const dir of watchDirs) {
    fs.watch(dir, { recursive: true }, (_eventType, filename) => {
      if (!filename || filename.endsWith('.d.ts')) return;
      if (!filename.endsWith('.ts') && !filename.endsWith('.md')) return;

      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        console.log(`\nChange detected: ${filename}`);
        try {
          await build([]);
        } catch (err) {
          console.error(`Build failed: ${err instanceof Error ? err.message : err}`);
        }
      }, 300);
    });
  }

  console.log('\nWatching for changes... (Ctrl+C to stop)');
  await new Promise(() => {});
}
