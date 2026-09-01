import * as fs from 'node:fs';
import * as path from 'node:path';
import { getPacksDir } from './install';

export async function uninstall(args: string[]) {
  const packId = args[0];
  if (!packId) {
    throw new Error('Usage: abuddy uninstall <pack-id>');
  }

  const packsDir = getPacksDir();
  const packDir = path.join(packsDir, packId);

  if (!fs.existsSync(packDir)) {
    throw new Error(`Pack "${packId}" is not installed.`);
  }

  const manifestPath = path.join(packDir, 'abuddy.json');
  let name = packId;
  if (fs.existsSync(manifestPath)) {
    try {
      name = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')).name ?? packId;
    } catch {}
  }

  fs.rmSync(packDir, { recursive: true, force: true });
  console.log(`Uninstalled "${name}"`);
  console.log(`\nRestart AgentBuddy to apply changes.`);
}
