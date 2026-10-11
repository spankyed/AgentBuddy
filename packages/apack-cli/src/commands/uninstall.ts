import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveAppContext } from '@apack/sdk/env';
import { uninstallPack } from '@apack/host/packs';
import { parseTargetEnv, envLabel } from '../utils';

export async function uninstall(args: string[]) {
  const { env, args: filtered } = parseTargetEnv(args);
  const packId = filtered[0];

  if (!packId) {
    throw new Error('Usage: apack uninstall <pack-id> [-d|--dev] [-b|--beta]');
  }

  const { packsDir } = resolveAppContext({ build: env });
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
