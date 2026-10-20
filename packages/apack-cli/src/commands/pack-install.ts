import { readSettingsOverrides } from '@apackdev/host/database';
import { HOST_PACK_ID } from '@apackdev/sdk/ids';
import { cliDirs, parseHostFlags, selectedHostPackages } from '../app/pack-host';
import type { AppEnvironment } from '@apackdev/sdk/env';
import { withPackMutation } from '../app/pack-mutation';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { installPack, installPackFromLocal, readHostCompatibility, readInstalledPacks, readAppPackSources, recordUserInstall } from '@apackdev/host/packs';
import { parseStorageProfile, targetDataContext, profileLabel, TARGET_ENV_USAGE } from '../utils';

/** `registry` is a bare pack name, resolvable only through apack.dev; `undefined` is a GitHub slug. */
function detectSourceKind(input: string): 'local' | 'url' | 'registry' | undefined {
  if (input.startsWith('http://') || input.startsWith('https://')) return 'url';
  if (input.startsWith('.') || input.startsWith('/') || input.startsWith('~')) return 'local';
  if (input.endsWith('.zip') || input.endsWith('.tgz') || input.endsWith('.tar.gz')) return 'local';
  if (fs.existsSync(path.resolve(input))) return 'local';
  if (input.includes('/')) return undefined; // GitHub slug
  return 'registry';
}

async function resolveFromRemoteRegistry(name: string): Promise<string> {
  // TODO: resolve pack name from apack.dev registry API
  throw new Error(`Registry install not yet available. Could not resolve "${name}" from apack.dev.\n\nUse a local path, URL, or GitHub slug (owner/repo) instead.`);
}

export async function install(args: string[]) {
  const { env, profile, args: rest } = parseStorageProfile(args);
  const flags = parseHostFlags(rest);
  const filtered = flags.args;
  const source = filtered[0];
  if (flags.release || flags.prebuilt || filtered.length > 1 || (source?.startsWith('-') && source !== '--help' && source !== '-h')) throw new Error('Usage: apack pack install <source> --host <path|beta> [--profile <name>]');

  if (!source || source === '--help' || source === '-h') {
    console.log(`
Usage: apack pack install <source> --host <path|beta> [--profile <name>]

Source can be:
  ./path/to/pack        Local directory
  /absolute/path        Local directory
  archive.tgz           Local archive (.tgz, .zip)
  https://example.com/pack.tgz   URL to archive
  owner/repo[@tag]      GitHub release
  pack-name             Registry name (apack.dev)

Options:
  --host <path|beta>    Source app; an associated host can supply it
  ${TARGET_ENV_USAGE}
`.trim());
    return;
  }

  const context = targetDataContext(env, profile);
  const { result, hostVersion } = await installPackSource(context, source, { kind: 'install', host: flags.host });

  if (result.missingDependencies.length > 0) {
    console.warn(`\n  Warning: missing dependencies: ${result.missingDependencies.join(', ')}`);
    console.warn('  Install them before opening the app. App-shipped packs are installed on first launch.');
  }

  if (!hostVersion) {
    console.warn(`\n  Note: the pack's hostVersion wasn't checked. apack${profileLabel(env, profile)} records its version when it starts with this data dir.`);
  }

  console.log(`\nInstalled "${result.name}" v${result.version}${profileLabel(env, profile)}`);
  console.log(`  Location: ${result.dir}`);
  console.log(`\nOpen apack to load the pack.`);
}

/** Install and replace share validation/publication; the explicit operation determines intent. */
export async function installPackSource(
  context: AppEnvironment, source: string, action: { kind: 'install'; host?: string } | { kind: 'replace'; id: string },
) {
  return withPackMutation(context, action.kind, async () => {
    const { packsDir, userDataDir, installedPacksFile } = context;
    readInstalledPacks(installedPacksFile, { strict: true });
    const host = action.kind === 'install' ? await selectedHostPackages(action.host, cliDirs()) : undefined;
    const { version: hostVersion, packFormat } = readHostCompatibility(userDataDir);
    const sourceKind = detectSourceKind(source);
    const resolvedInput = sourceKind === 'registry' ? await resolveFromRemoteRegistry(source) : source;
    const options = { hostVersion, packFormat, installedPacksFile, settingsOverrides: () => readSettingsOverrides(userDataDir),
      beforePlace: (manifest: { id: string }) => {
        if (manifest.id === HOST_PACK_ID) throw new Error('The native host is not an installable pack');
        if (action.kind === 'replace') {
          if (manifest.id !== action.id) throw new Error(`Replacement expected pack "${action.id}", received "${manifest.id}"`);
        } else {
          if (!host || !fs.statSync(host.dir).isDirectory()) throw new Error('The selected source app packages are unavailable');
          const catalog = readAppPackSources(host.dir);
          const advertised = new Set([...catalog.sources, ...catalog.problems].map(source => source.id));
          if (advertised.has(manifest.id) || readInstalledPacks(installedPacksFile, { strict: true }).find(record => record.id === manifest.id)?.updatesWith === 'app') {
            throw new Error(`"${manifest.id}" is an app default. Use apack pack replace ${manifest.id} <source>.`);
          }
        }
      },
      accept: (candidate: Awaited<ReturnType<typeof installPack>>) => {
        recordUserInstall(installedPacksFile, candidate.id, sourceKind === undefined ? source : undefined);
        return undefined;
      },
    };
    const result = sourceKind === 'local'
      ? await installPackFromLocal(resolvedInput, packsDir, options)
      : await installPack(resolvedInput, sourceKind === 'registry' ? 'url' : sourceKind, packsDir, options);
    return { result, hostVersion };
  });
}
