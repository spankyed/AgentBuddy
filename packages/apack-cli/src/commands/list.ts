import { packInventory } from '../app/installed-packs';
import { parseStorageProfile, targetDataContext, profileLabel } from '../utils';

export async function list(args: string[]) {
  const { env, profile, args: rest } = parseStorageProfile(args);
  if (rest.some(arg => arg !== '--json') || rest.length > 1) throw new Error('Usage: apack pack list [--profile <name>] [--json]');
  const context = targetDataContext(env, profile);
  const packs = packInventory(context).map(({ manifest, record }) => ({
    id: manifest.id, name: manifest.name, version: manifest.version,
    updatesWith: record.updatesWith ?? 'user', enabled: record.enabled,
    dependencies: manifest.dependencies ?? {}, source: record.installedFrom ?? null,
  }));
  if (rest.includes('--json')) {
    console.log(JSON.stringify({ profile: profile ?? env, packsDir: context.packsDir, packs }));
    return;
  }
  const label = profileLabel(env, profile);
  if (!packs.length) { console.log(`No packs installed${label}.`); return; }
  console.log(`Installed packs${label}:\n`);
  for (const pack of packs) {
    const deps = Object.keys(pack.dependencies);
    console.log(`  ${pack.id}  v${pack.version}  "${pack.name}"${deps.length ? `  deps: ${deps.join(', ')}` : ''}${pack.enabled ? '' : '  (disabled)'}`);
  }
  console.log(`\n${packs.length} pack(s) in ${context.packsDir}`);
}
