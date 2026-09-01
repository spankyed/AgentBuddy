import * as fs from 'node:fs';
import * as path from 'node:path';
import { build } from './build';
import { findPackRoot } from '../utils';

export async function dev(_args: string[]) {
  const root = findPackRoot(process.cwd());
  const srcDir = path.join(root, 'src');

  if (!fs.existsSync(srcDir)) {
    throw new Error('No src/ directory to watch');
  }

  console.log('Starting dev mode (watching for changes)...\n');

  await build([]);

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  function scheduleBuild(label: string) {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      console.log(`\nChange detected: ${label}`);
      try {
        await build([]);
      } catch (err) {
        console.error(`Build failed: ${err instanceof Error ? err.message : err}`);
      }
    }, 300);
  }

  fs.watch(srcDir, { recursive: true }, (_eventType, filename) => {
    if (!filename || filename.endsWith('.d.ts')) return;
    if (!filename.endsWith('.ts') && !filename.endsWith('.md')) return;
    scheduleBuild(filename);
  });

  // Manifest changes affect generated types (entities, relKinds, deps)
  fs.watch(path.join(root, 'abuddy.json'), () => {
    scheduleBuild('abuddy.json');
  });

  console.log('Watching src/ and abuddy.json... (Ctrl+C to stop)');
  await new Promise(() => {});
}
