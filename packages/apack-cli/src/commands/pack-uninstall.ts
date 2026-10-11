import * as fs from 'node:fs';
import * as path from 'node:path';
import { uninstallPack } from '@apackdev/host/packs';
import { parseTargetEnv, targetDataContext, envLabel } from '../utils';

export async function uninstall(args: string[]) {
  const { env, args: filtered } = parseTargetEnv(args);
  const packId = filtered[0];

  if (!packId || filtered.length !== 1 || packId.startsWith('-')) {
    throw new Error('Usage: apack pack uninstall <pack-id> [--data <name>]');
  }

  const { packsDir } = targetDataContext(env, args);
  const manifestPath = path.join(packsDir, packId, 'apack.json');
  let name = packId;
  if (fs.existsSync(manifestPath)) {
    try {
      name = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')).name ?? packId;
    } catch {}
  }

  await uninstallPack(packId, packsDir);

  console.log(`Uninstalled "${name}"${envLabel(env)}`);
  console.log(`\nRestart apack to apply changes.`);
}
