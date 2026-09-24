// @abuddy/ui's exports map lists every public module with its types (no wildcards). This computes
// it from src/; run directly to write it into package.json. build-package fails when it's stale.
// Public modules are the .ts files, except specs and tests (*.spec.ts, *.test.ts) and modules under
// an internal/ directory. A component is public through its entry module (design/button.ts
// re-exporting ./button.vue), so its export resolves to a TypeScript file in the monorepo too;
// SFCs without one are internal.
//
//   npm run exports:update -w @abuddy/ui   (writes the exports map)
//   npm run exports:check               (--check: fails on a stale map or a component without an entry)
import * as fs from 'node:fs';
import * as path from 'node:path';
import { SOURCE_CONDITION, walk } from '../../../scripts/lib/published-imports.ts';

export const pkgDir = path.resolve(import.meta.dirname, '..');
const srcDir = path.join(pkgDir, 'src');

/** Whether a module under src (relative path) is published */
export function isPublicModule(rel: string): boolean {
  return /(?<!\.d|\.spec|\.test)\.ts$/.test(rel) && !rel.split(path.sep).slice(0, -1).includes('internal');
}

/** Public modules: export subpath (without `./`) → source file relative to the package. */
export function computeEntries(src = srcDir): Record<string, string> {
  const entries: Record<string, string> = {};
  for (const file of walk(src).sort()) {
    const rel = path.relative(src, file);
    if (isPublicModule(rel)) entries[rel.replace(/\.ts$/, '')] = `src/${rel}`;
  }
  return entries;
}

export function computeExports(src = srcDir): Record<string, unknown> {
  const exportsMap: Record<string, unknown> = { './package.json': './package.json' };
  for (const [name, source] of Object.entries(computeEntries(src))) {
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
export function findComponentsWithoutEntry(
  roots = [
    ...fs.readdirSync(path.join(repoRoot, 'packages')).filter((name) => name !== 'abuddy-ui').map((name) => path.join(repoRoot, 'packages', name)),
    path.join(repoRoot, 'tests'),
  ],
  src = srcDir,
): string[] {
  const problems: string[] = [];
  for (const root of roots.filter((dir) => fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory())) {
    for (const file of consumerFiles(root)) {
      for (const [, subpath] of fs.readFileSync(file, 'utf-8').matchAll(/@abuddy\/ui\/([A-Za-z0-9_./-]+?)(?=['"`\s;)])/g)) {
        // `@abuddy/ui/design/button` names an entry module; `…/button.vue` names the component itself
        const component = subpath.endsWith('.vue') ? subpath.slice(0, -'.vue'.length) : subpath;
        const entry = `${component}.ts`.split('/').join(path.sep);
        const published = fs.existsSync(path.join(src, entry)) && isPublicModule(entry);
        if (fs.existsSync(path.join(src, `${component}.vue`)) && !published) {
          problems.push(`${path.relative(repoRoot, file)}: @abuddy/ui/${subpath}`);
        }
      }
    }
  }
  return problems;
}

/** The message for components imported without an entry module */
export function missingEntriesMessage(missing: string[]): string {
  const subpaths = [...new Set(missing.map((line) => line.split('@abuddy/ui/')[1]))];
  return `These @abuddy/ui components are imported but have no entry module, so @abuddy/ui doesn't export them:\n  ${missing.join('\n  ')}\n` +
    `Publish each with an entry next to it, e.g. src/${subpaths[0]}.ts:\n` +
    `  export { default } from './${path.basename(subpaths[0])}.vue';\n  export * from './${path.basename(subpaths[0])}.vue';`;
}

// Run as a script, also through a symlinked path
if (process.argv[1] && import.meta.filename === fs.realpathSync(process.argv[1])) {
  const missing = findComponentsWithoutEntry();
  if (missing.length > 0) {
    console.error(missingEntriesMessage(missing));
    process.exit(1);
  }
  const manifestPath = path.join(pkgDir, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  if (process.argv.includes('--check')) {
    if (JSON.stringify(pkg.exports) !== JSON.stringify(computeExports())) {
      console.error('packages/abuddy-ui/package.json exports are out of date with src/. Run: npm run exports:update -w @abuddy/ui');
      process.exit(1);
    }
    console.log('@abuddy/ui exports and component entry modules are up to date');
  } else {
    pkg.exports = computeExports();
    fs.writeFileSync(manifestPath, JSON.stringify(pkg, null, 2) + '\n');
    console.log(`Wrote ${Object.keys(pkg.exports).length} exports to package.json`);
  }
}
