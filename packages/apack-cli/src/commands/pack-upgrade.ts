import semver from 'semver';
import type { AppContext } from '@apackdev/sdk/env';
import { PACK_ID_PATTERN } from '@apackdev/sdk/ids';
import { findRunningApp, holdDatabaseWriteLock } from '@apackdev/host/database';
import { findLatestRelease, installPackFromGitHub, readHostInfo } from '@apackdev/host/packs';
import { packInventory, recordCliInstall } from '../app/installed-packs';
import { parseStorageProfile, targetDataContext } from '../utils';
import { packUpdates } from './pack-outdated';

export async function upgradePack(context: AppContext, id: string, options: {
  find?: typeof findLatestRelease;
  install?: typeof installPackFromGitHub;
} = {}) {
  if (!PACK_ID_PATTERN.test(id)) throw new Error('Specify a valid installed pack ID.');
  const host = readHostInfo(context.userDataDir);
  if (!host.version || host.packFormat === undefined) throw new Error('Open the app with this profile first to record its version and pack format.');
  const lock = holdDatabaseWriteLock(context.userDataDir, `apack pack upgrade ${id}`);
  try {
    if (findRunningApp(context)) throw new Error('Quit the app before upgrading its installed packs.');
    const [update] = await packUpdates(context, options.find, id);
    if (!update) throw new Error(`Pack is not installed: ${id}`);
    if (update.status === 'unmanaged' || update.status === 'error') throw new Error(`${id}: ${update.reason}`);
    if (!update.candidate) return { id, version: update.currentVersion, upgraded: false };
    const { version, tag } = update.candidate;
    const source = `${update.source!.split('@')[0]}@${tag}`;
    const installed = new Map(packInventory(context).map(pack => [pack.manifest.id, pack.manifest.version]));
    const result = await (options.install ?? installPackFromGitHub)(source, context.packsDir, {
      hostVersion: host.version, packFormat: host.packFormat,
      beforePlace: manifest => {
        if (manifest.id !== id || manifest.version !== version || manifest.builtIn) {
          throw new Error(`Expected external pack ${id} v${version}, received ${manifest.id} v${manifest.version}.`);
        }
        for (const [dependency, range] of Object.entries(manifest.dependencies ?? {})) {
          const current = installed.get(dependency);
          if (!current || (semver.validRange(range) && !semver.satisfies(current, range, { includePrerelease: true }))) {
            throw new Error(`Install a compatible ${dependency} (${range}) before upgrading ${id}.`);
          }
        }
      },
    });
    recordCliInstall(context.installedPacksFile, id, source);
    return { id, version: result.version, upgraded: true };
  } finally { lock.release(); }
}

export async function upgrade(args: string[]): Promise<void> {
  const { env, profile, args: rest } = parseStorageProfile(args);
  if (rest.length !== 1 || rest[0]!.startsWith('-')) throw new Error('Usage: apack pack upgrade <id> [--profile <name>]');
  const result = await upgradePack(targetDataContext(env, profile), rest[0]!);
  console.log(result.upgraded ? `Upgraded ${result.id} to ${result.version}. Open the app to load it.` : `${result.id} ${result.version}: no compatible newer release.`);
}
