// @abuddy/ui's exports map lists every module with its types (no wildcards). This computes it
// from src/; run directly to write it into package.json. build-package fails when it's stale.
// Components are exported without their .vue extension, like the .ts modules: the published
// package contains their compiled JS, and the monorepo resolves the SFC source.
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
    const match = /^(.*)(?<!\.d)\.(ts|vue)$/.exec(rel);
    if (!match) continue;
    if (entries[match[1]]) throw new Error(`src/${rel} and ${entries[match[1]]} would both be exported as ./${match[1]}`);
    entries[match[1]] = `src/${rel}`;
  }
  return entries;
}

export function computeExports(): Record<string, unknown> {
  const exportsMap: Record<string, unknown> = { './package.json': './package.json' };
  for (const [name, source] of Object.entries(computeEntries())) {
    const isComponent = source.endsWith('.vue');
    // TypeScript needs `types` first. For components the source condition inside it keeps monorepo
    // type checks on the SFC source rather than a dist/ that may be stale.
    exportsMap[`./${name}`] = isComponent
      ? {
        types: { [SOURCE_CONDITION]: `./${source}`, default: `./dist/${name}.d.vue.ts` },
        [SOURCE_CONDITION]: `./${source}`,
        default: `./dist/${name}.js`,
      }
      : { [SOURCE_CONDITION]: `./${source}`, types: `./dist/${name}.d.ts`, default: `./dist/${name}.js` };
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
