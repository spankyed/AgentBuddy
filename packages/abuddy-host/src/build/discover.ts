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
