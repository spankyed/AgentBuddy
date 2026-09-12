import * as fs from 'node:fs';
import * as path from 'node:path';
import { installPack, installPackFromLocal } from '@abuddy/sdk/packs';
import { resolveAppContext } from '@abuddy/sdk/env';
import { parseTargetEnv, envLabel, TARGET_ENV_USAGE } from '../utils';

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
  const { env, args: filtered } = parseTargetEnv(args);
  const source = filtered[0];

  if (!source || source === '--help' || source === '-h') {
    console.log(`
Usage: abuddy install <source> [-d|--dev] [-b|--beta]

Source can be:
  ./path/to/pack        Local directory
  /absolute/path        Local directory
  archive.tgz           Local archive (.tgz, .zip)
  https://example.com/pack.tgz   URL to archive
  owner/repo[@tag]      GitHub release
  pack-name             Registry name (abuddy.com)

Options:
  ${TARGET_ENV_USAGE}
`.trim());
    return;
  }

  const { packsDir } = resolveAppContext({ env });
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

  console.log(`\nInstalled "${result.name}" v${result.version}${envLabel(env)}`);
  console.log(`  Location: ${result.dir}`);
  console.log(`\nRestart AgentBuddy to load the pack.`);
}
