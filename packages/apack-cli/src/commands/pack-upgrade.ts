import semver from 'semver';
import type { AppContext } from '@apackdev/sdk/env';
import { PACK_ID_PATTERN } from '@apackdev/sdk/ids';
import { withPackMutation } from '../app/pack-mutation';
import { findLatestRelease, installPackFromGitHub, readHostInfo } from '@apackdev/host/packs';
import { packInventory, recordCliInstall } from '../app/installed-packs';
import { parseStorageProfile, targetDataContext } from '../utils';
import { packUpdate } from '../app/pack-updates';

export async function upgradePack(context: AppContext, id: string, options: {
  find?: typeof findLatestRelease;
  install?: typeof installPackFromGitHub;
} = {}) {
  if (!PACK_ID_PATTERN.test(id)) throw new Error('Specify a valid installed pack ID.');
  return withPackMutation(context, `upgrade ${id}`, async () => {
    const host = readHostInfo(context.userDataDir);
    if (!host.version || host.packFormat === undefined) throw new Error('Open the app with this profile first to record its version and pack format.');
    const inventory = packInventory(context);
    const pack = inventory.find(pack => pack.manifest.id === id);
    if (!pack) throw new Error(`Pack is not installed: ${id}`);
    const update = await packUpdate(pack, { hostVersion: host.version, includePrerelease: context.env === 'beta' }, options.find);
    if (update.status === 'unmanaged' || update.status === 'error') throw new Error(`${id}: ${update.reason}`);
    if (!update.candidate) return { id, version: update.currentVersion, upgraded: false };
    const { version, tag } = update.candidate;
    const source = `${update.source!.split('@')[0]}@${tag}`;
    const installed = new Map(inventory.filter(pack => pack.record.enabled).map(pack => [pack.manifest.id, pack.manifest.version]));
    for (const { manifest } of inventory) {
      if (manifest.id === id) continue;
      const range = manifest.dependencies?.[id];
      if (range && semver.validRange(range) && !semver.satisfies(version, range, { includePrerelease: true })) {
        throw new Error(`${manifest.id} requires ${id} ${range}; upgrading to ${version} would break it.`);
      }
    }
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
  });
}

export async function upgrade(args: string[]): Promise<void> {
  const { env, profile, args: rest } = parseStorageProfile(args);
  if (rest.length !== 1 || rest[0]!.startsWith('-')) throw new Error('Usage: apack pack upgrade <id> [--profile <name>]');
  const result = await upgradePack(targetDataContext(env, profile), rest[0]!);
  console.log(result.upgraded ? `Upgraded ${result.id} to ${result.version}. Open the app to load it.` : `${result.id} ${result.version}: no compatible newer release.`);
}
