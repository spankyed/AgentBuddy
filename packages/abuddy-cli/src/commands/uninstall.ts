import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveAppContext } from '@abuddy/sdk/env';
import { uninstallPack } from '@abuddy/sdk/packs';
import { parseTargetEnv, envLabel } from '../utils';

export async function uninstall(args: string[]) {
  const { env, args: filtered } = parseTargetEnv(args);
  const packId = filtered[0];

  if (!packId) {
    throw new Error('Usage: abuddy uninstall <pack-id> [-d|--dev] [-b|--beta]');
  }

  const { packsDir } = resolveAppContext({ env });
  const manifestPath = path.join(packsDir, packId, 'abuddy.json');
  let name = packId;
  if (fs.existsSync(manifestPath)) {
    try {
      name = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')).name ?? packId;
    } catch {}
  }

  await uninstallPack(packId, packsDir);

  console.log(`Uninstalled "${name}"${envLabel(env)}`);
  console.log(`\nRestart AgentBuddy to apply changes.`);
}
