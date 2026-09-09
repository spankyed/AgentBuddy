import * as fs from 'node:fs';
import * as path from 'node:path';
import { getPacksDir } from './install';

export async function list(_args: string[]) {
  const packsDir = getPacksDir();

  if (!fs.existsSync(packsDir)) {
    console.log('No packs installed.');
    return;
  }

  const entries = fs.readdirSync(packsDir, { withFileTypes: true })
    .filter(e => e.isDirectory());

  if (entries.length === 0) {
    console.log('No packs installed.');
    return;
  }

  console.log('Installed packs:\n');

  for (const entry of entries) {
    const manifestPath = path.join(packsDir, entry.name, 'abuddy.json');
    if (!fs.existsSync(manifestPath)) {
      console.log(`  ${entry.name}  (missing abuddy.json)`);
      continue;
    }

    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      const deps = Object.keys(manifest.dependencies ?? {});
      const depInfo = deps.length > 0 ? `  deps: ${deps.join(', ')}` : '';
      console.log(`  ${manifest.id}  v${manifest.version}  "${manifest.name}"${depInfo}`);
    } catch {
      console.log(`  ${entry.name}  (invalid abuddy.json)`);
    }
  }

  console.log(`\n${entries.length} pack(s) in ${packsDir}`);
}
