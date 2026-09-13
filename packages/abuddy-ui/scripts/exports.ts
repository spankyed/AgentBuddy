// @abuddy/ui's exports map lists every public module with its types (no wildcards). This computes
// it from src/; run directly to write it into package.json. build-package fails when it's stale.
// Public modules are the .ts files. A component is public through its entry module
// (design/button.ts re-exporting ./button.vue), so its export resolves to a TypeScript file in the
// monorepo too; SFCs without one are internal.
//
//   npm run exports:update -w @abuddy/ui
import * as fs from 'node:fs';
import * as path from 'node:path';
import { SOURCE_CONDITION, walk } from '../../../scripts/lib/published-imports.ts';

export const pkgDir = path.resolve(import.meta.dirname, '..');
const srcDir = path.join(pkgDir, 'src');

/** Public modules: export subpath (without `./`) → source file relative to the package. */
export function computeEntries(): Record<string, string> {
  const entries: Record<string, string> = {};
  for (const file of walk(srcDir).sort()) {
    const rel = path.relative(srcDir, file);
    const match = /^(.*)(?<!\.d)\.ts$/.exec(rel);
    if (match) entries[match[1]] = `src/${rel}`;
  }
  return entries;
}

export function computeExports(): Record<string, unknown> {
  const exportsMap: Record<string, unknown> = { './package.json': './package.json' };
  for (const [name, source] of Object.entries(computeEntries())) {
    exportsMap[`./${name}`] = { [SOURCE_CONDITION]: `./${source}`, types: `./dist/${name}.d.ts`, default: `./dist/${name}.js` };
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
