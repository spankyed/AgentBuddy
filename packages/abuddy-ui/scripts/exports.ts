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

const repoRoot = path.resolve(pkgDir, '..', '..');
const CONSUMER_FILE = /\.(ts|tsx|vue|js|mjs|sh)$/;
const SKIPPED_DIRS = new Set(['node_modules', 'dist', '.git', '.abuddy', '__generated__']);

function* consumerFiles(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIPPED_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* consumerFiles(full);
    else if (CONSUMER_FILE.test(entry.name)) yield full;
  }
}

/**
 * `file: specifier` for each import of a component that has no entry module. The monorepo's
 * packages (other than @abuddy/ui) and tests are scanned; without an entry the import fails with
 * TypeScript's "Cannot find module" and the published package doesn't export the component.
 */
export function findComponentsWithoutEntry(): string[] {
  const roots = [
    ...fs.readdirSync(path.join(repoRoot, 'packages')).filter((name) => name !== 'abuddy-ui').map((name) => path.join(repoRoot, 'packages', name)),
    path.join(repoRoot, 'tests'),
  ].filter((dir) => fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory());
  const problems: string[] = [];
  for (const root of roots) {
    for (const file of consumerFiles(root)) {
      for (const [, subpath] of fs.readFileSync(file, 'utf-8').matchAll(/@abuddy\/ui\/([A-Za-z0-9_./-]+?)(?=['"`\s;)])/g)) {
        if (fs.existsSync(path.join(srcDir, `${subpath}.vue`)) && !fs.existsSync(path.join(srcDir, `${subpath}.ts`))) {
          problems.push(`${path.relative(repoRoot, file)}: @abuddy/ui/${subpath}`);
        }
      }
    }
  }
  return problems;
}

if (import.meta.filename === process.argv[1]) {
  const missing = findComponentsWithoutEntry();
  if (missing.length > 0) {
    const subpaths = [...new Set(missing.map((line) => line.split('@abuddy/ui/')[1]))];
    console.error(
      `These @abuddy/ui components are imported but have no entry module, so @abuddy/ui doesn't export them:\n  ${missing.join('\n  ')}\n` +
      `Publish each with an entry next to it, e.g. src/${subpaths[0]}.ts:\n` +
      `  export { default } from './${path.basename(subpaths[0])}.vue';\n  export * from './${path.basename(subpaths[0])}.vue';`,
    );
    process.exit(1);
  }
  const manifestPath = path.join(pkgDir, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  pkg.exports = computeExports();
  fs.writeFileSync(manifestPath, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`Wrote ${Object.keys(pkg.exports).length} exports to package.json`);
}
