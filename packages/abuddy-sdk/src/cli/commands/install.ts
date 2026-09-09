import * as fs from 'node:fs';
import * as path from 'node:path';
import { installPack, installPackFromLocal } from '../../packs/pack-installer';

function detectSource(input: string): 'local' | 'url' | undefined {
  if (input.startsWith('http://') || input.startsWith('https://')) return 'url';
  if (input.startsWith('.') || input.startsWith('/') || input.startsWith('~')) return 'local';
  if (input.endsWith('.zip') || input.endsWith('.tgz') || input.endsWith('.tar.gz')) return 'local';
  if (fs.existsSync(path.resolve(input))) return 'local';
  return undefined;
}

export async function install(args: string[]) {
  const source = args[0];
  if (!source) {
    throw new Error('Usage: abuddy install <source>\n\nSource can be a local path, .zip, .tgz, URL, or GitHub slug (owner/repo[@tag]).');
  }

  const kind = detectSource(source);
  const result = kind === 'local'
    ? await installPackFromLocal(source)
    : await installPack(source, kind);

  if (result.missingDependencies.length > 0) {
    console.warn(`\n  Warning: missing dependencies: ${result.missingDependencies.join(', ')}`);
    console.warn(`  Install them first for full functionality.`);
  }

  console.log(`\nInstalled "${result.name}" v${result.version}`);
  console.log(`  Location: ${result.dir}`);
  console.log(`\nRestart AgentBuddy to load the pack.`);
}
