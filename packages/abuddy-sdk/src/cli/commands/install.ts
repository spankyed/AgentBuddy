import * as fs from 'node:fs';
import * as path from 'node:path';
import { installPack, installPackFromLocal } from '../../packs/pack-installer';
import { getPacksDirForEnv } from '../../packs/pack-discovery';

function detectSource(input: string): 'local' | 'url' | 'registry' | undefined {
  if (input.startsWith('http://') || input.startsWith('https://')) return 'url';
  if (input.startsWith('.') || input.startsWith('/') || input.startsWith('~')) return 'local';
  if (input.endsWith('.zip') || input.endsWith('.tgz') || input.endsWith('.tar.gz')) return 'local';
  if (fs.existsSync(path.resolve(input))) return 'local';
  if (input.includes('/')) return undefined; // GitHub slug
  return 'registry';
}

async function resolveFromRegistry(name: string): Promise<string> {
  // TODO: resolve pack name from abuddy.com registry API
  throw new Error(`Registry install not yet available. Could not resolve "${name}" from abuddy.com.\n\nUse a local path, URL, or GitHub slug (owner/repo) instead.`);
}

export async function install(args: string[]) {
  const dev = args.includes('-d') || args.includes('--dev');
  const filtered = args.filter(a => a !== '-d' && a !== '--dev');
  const source = filtered[0];

  if (!source || source === '--help' || source === '-h') {
    console.log(`
Usage: abuddy install <source> [-d|--dev]

Source can be:
  ./path/to/pack        Local directory
  /absolute/path        Local directory
  archive.tgz           Local archive (.tgz, .zip)
  https://example.com/pack.tgz   URL to archive
  owner/repo[@tag]      GitHub release
  pack-name             Registry name (abuddy.com)

Options:
  -d, --dev    Install to the dev environment instead of prod
`.trim());
    return;
  }

  const packsDir = getPacksDirForEnv(dev);
  const kind = detectSource(source);

  let resolvedSource = source;
  if (kind === 'registry') {
    resolvedSource = await resolveFromRegistry(source);
  }

  const result = kind === 'local'
    ? await installPackFromLocal(resolvedSource, packsDir)
    : await installPack(resolvedSource, kind === 'registry' ? 'url' : kind, packsDir);

  if (result.missingDependencies.length > 0) {
    console.warn(`\n  Warning: missing dependencies: ${result.missingDependencies.join(', ')}`);
    console.warn(`  Install them first for full functionality.`);
  }

  const env = dev ? ' (dev)' : '';
  console.log(`\nInstalled "${result.name}" v${result.version}${env}`);
  console.log(`  Location: ${result.dir}`);
  console.log(`\nRestart AgentBuddy to load the pack.`);
}
