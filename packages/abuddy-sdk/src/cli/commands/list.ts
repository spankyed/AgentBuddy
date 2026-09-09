import * as fs from 'node:fs';
import * as path from 'node:path';
import { getPacksDirForEnv } from '../../packs/pack-discovery';

export async function list(args: string[]) {
  const dev = args.includes('-d') || args.includes('--dev');
  const packsDir = getPacksDirForEnv(dev);
  const env = dev ? ' (dev)' : '';

  if (!fs.existsSync(packsDir)) {
    console.log(`No packs installed${env}.`);
    return;
  }

  const entries = fs.readdirSync(packsDir, { withFileTypes: true })
    .filter(e => e.isDirectory());

  if (entries.length === 0) {
    console.log(`No packs installed${env}.`);
    return;
  }

  console.log(`Installed packs${env}:\n`);

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
