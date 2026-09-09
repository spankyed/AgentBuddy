import * as fs from 'node:fs';
import * as path from 'node:path';
import { getPacksDir } from '../../packs/pack-discovery';
import { uninstallPack } from '../../packs/pack-installer';

export async function uninstall(args: string[]) {
  const packId = args[0];
  if (!packId) {
    throw new Error('Usage: abuddy uninstall <pack-id>');
  }

  const packsDir = getPacksDir();
  const manifestPath = path.join(packsDir, packId, 'abuddy.json');
  let name = packId;
  if (fs.existsSync(manifestPath)) {
    try {
      name = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')).name ?? packId;
    } catch {}
  }

  await uninstallPack(packId);
  console.log(`Uninstalled "${name}"`);
  console.log(`\nRestart AgentBuddy to apply changes.`);
}
