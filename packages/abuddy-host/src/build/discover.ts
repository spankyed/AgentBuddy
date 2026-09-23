import * as fs from 'node:fs';
import * as path from 'node:path';

export interface BuiltInPackBuildInfo {
  id: string;
  dir: string;
  srcDir: string;
  entryPath: string | null;
}

export function discoverBuiltInPacksForBuild(packagesRoot: string): BuiltInPackBuildInfo[] {
  const packs: BuiltInPackBuildInfo[] = [];
  for (const entry of fs.readdirSync(packagesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.resolve(packagesRoot, entry.name);
    const manifestPath = path.join(dir, 'abuddy.json');
    if (!fs.existsSync(manifestPath)) continue;
    try {
      const m = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      if (!m.builtIn || !m.id) continue;
      const srcDir = path.join(dir, 'src');
      const entryBase = path.join(srcDir, '__generated__', 'pack-entry');
      const entryPath = (fs.existsSync(entryBase + '.ts') || fs.existsSync(entryBase + '.js'))
        ? entryBase
        : null;
      packs.push({ id: m.id, dir, srcDir, entryPath });
    } catch {}
  }
  return packs;
}

/**
 * The module a packaged app loads its built-in packs through: one loader per pack whose entry the scan found, each a
 * dynamic import with a literal path, so the bundler traces it and bundles the pack. `fromDir` is the directory the
 * generated module resolves from (the module that imports it). This is the only way a packaged app reaches a built-in
 * pack — from source it loads each pack's built runtime instead — so a pack missing here is a pack the app doesn't
 * have, and no pack at all is a bundle that would start with nothing.
 */
export function builtInPackLoadersModule(packs: readonly BuiltInPackBuildInfo[], fromDir: string): string {
  const withEntry = packs.filter((pack) => pack.entryPath);
  if (withEntry.length === 0) {
    throw new Error('[built-in-pack-loaders] No built-in packs found — production bundle would have no packs to load');
  }
  const lines = withEntry.map((pack) => {
    const relative = path.relative(fromDir, pack.entryPath!).replace(/\\/g, '/');
    return `  ${JSON.stringify(pack.id)}: () => import('${relative}'),`;
  });
  return `export default {\n${lines.join('\n')}\n};\n`;
}
