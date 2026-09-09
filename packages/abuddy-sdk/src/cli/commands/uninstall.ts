import * as fs from 'node:fs';
import * as path from 'node:path';
import { getPacksDirForEnv } from '../../packs/pack-discovery';
import { uninstallPack } from '../../packs/pack-installer';

export async function uninstall(args: string[]) {
  const dev = args.includes('-d') || args.includes('--dev');
  const filtered = args.filter(a => a !== '-d' && a !== '--dev');
  const packId = filtered[0];

  if (!packId) {
    throw new Error('Usage: abuddy uninstall <pack-id> [-d|--dev]');
  }

  const packsDir = getPacksDirForEnv(dev);
  const manifestPath = path.join(packsDir, packId, 'abuddy.json');
  let name = packId;
  if (fs.existsSync(manifestPath)) {
    try {
      name = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')).name ?? packId;
    } catch {}
  }

  await uninstallPack(packId, packsDir);

  const env = dev ? ' (dev)' : '';
  console.log(`Uninstalled "${name}"${env}`);
  console.log(`\nRestart AgentBuddy to apply changes.`);
}
