import * as fs from 'node:fs';
import * as path from 'node:path';
import { withPackMutation } from '../app/pack-mutation';
import { forgetCliInstall } from '../app/installed-packs';
import { PACK_ID_PATTERN } from '@apackdev/sdk/ids';
import { uninstallPack, readInstalledPacks } from '@apackdev/host/packs';
import { parseStorageProfile, targetDataContext, profileLabel } from '../utils';

export async function uninstall(args: string[]) {
  const { env, profile, args: filtered } = parseStorageProfile(args);
  const packId = filtered[0];

  if (!packId || filtered.length !== 1 || !PACK_ID_PATTERN.test(packId)) {
    throw new Error('Usage: apack pack uninstall <pack-id> [--profile <name>]');
  }

  const context = targetDataContext(env, profile);
  const name = await withPackMutation(context, 'uninstall', async () => {
    const { packsDir, installedPacksFile } = context;
    readInstalledPacks(installedPacksFile, { strict: true });
    const manifestPath = path.join(packsDir, packId, 'apack.json');
    let name = packId;
    if (fs.existsSync(manifestPath)) {
      try {
        name = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')).name ?? packId;
      } catch {}
    }

    await uninstallPack(packId, packsDir);
    forgetCliInstall(installedPacksFile, packId);

    return name;
  });

  console.log(`Uninstalled "${name}"${profileLabel(env, profile)}`);
  console.log(`\nOpen apack to apply changes.`);
}
