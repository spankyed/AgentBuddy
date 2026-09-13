// @abuddy/ui's exports map lists every module with its types (no wildcards). This computes it
// from src/; run directly to write it into package.json. build-package fails when it's stale.
//
//   npm run exports:update -w @abuddy/ui
import * as fs from 'node:fs';
import * as path from 'node:path';
import { SOURCE_CONDITION, walk } from '../../../scripts/lib/published-imports.ts';

export const pkgDir = path.resolve(import.meta.dirname, '..');
const srcDir = path.join(pkgDir, 'src');

export function computeExports(): Record<string, unknown> {
  const exportsMap: Record<string, unknown> = { './package.json': './package.json' };
  for (const file of walk(srcDir).sort()) {
    const rel = path.relative(srcDir, file);
    if (rel.endsWith('.ts') && !rel.endsWith('.d.ts')) {
      const base = rel.slice(0, -'.ts'.length);
      exportsMap[`./${base}`] = { [SOURCE_CONDITION]: `./src/${rel}`, types: `./dist/${base}.d.ts`, default: `./dist/${base}.js` };
    } else if (rel.endsWith('.vue')) {
      const base = rel.slice(0, -'.vue'.length);
      exportsMap[`./${rel}`] = { [SOURCE_CONDITION]: `./src/${rel}`, types: `./dist/${base}.d.vue.ts`, default: `./dist/${rel}` };
    }
  }
  return exportsMap;
}

if (import.meta.filename === process.argv[1]) {
  const manifestPath = path.join(pkgDir, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  pkg.exports = computeExports();
  fs.writeFileSync(manifestPath, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`Wrote ${Object.keys(pkg.exports).length} exports to package.json`);
}
