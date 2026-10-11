// Builds @apack/ui's dist/: tsdown compiles the components and modules to ESM (with the CSS each
// component imports), and vue-tsc typechecks them and emits per-module declarations. package.json is what the
// published manifest is derived from; its exports resolve source under the @apack/source condition (the repo's
// own configs) and dist otherwise, and `stagePublishTree` writes what npm publishes into publish/.
//
//   tsx ../../scripts/build-ui-package.ts .     (from packages/apack-ui)
//
// Separate from build-package.ts, which is plain tsc: the two share no steps beyond the shipped-imports
// check. It lives here rather than in the package because it reads the repo's build rule
// (@apack/host/build/packages-built), and a package's own scripts import no package above their layer.
// The exports helpers stay with the package, since `npm run exports:update -w @apack/ui` runs them too.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { BareImports, assertExportTargetsBuilt, isDeclaration, rewriteDeclarationExtensions, walk } from './lib/published-imports.ts';
import { computeExports, findComponentsWithoutEntry, missingEntriesMessage, pkgDir } from '../packages/apack-ui/scripts/exports.ts';
import { runPackageBuild } from '@apack/host/build/packages-built';
import { replaceDir } from '@apack/host/replace-dir';
import { stagePublishTree } from '@apack/host/build/published-manifest';

const outDir = path.join(pkgDir, 'dist');
/** Built here and renamed over `dist` at the end; `scripts/build-package.ts` says why, and `.temp/` is ignored */
const stagedDir = path.join(pkgDir, '.temp', 'build');
const require = createRequire(import.meta.url);
const run = (bin: string, args: string[]) => execFileSync(process.execPath, [bin, ...args], { stdio: 'inherit', cwd: pkgDir });

async function main(): Promise<void> {
  const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf-8'));
  const missingEntries = findComponentsWithoutEntry();
  if (missingEntries.length > 0) throw new Error(missingEntriesMessage(missingEntries));
  if (!isDeepStrictEqual(pkg.exports, computeExports())) {
    throw new Error('packages/apack-ui/package.json exports are out of date with src/. Run: npm run exports:update -w @apack/ui');
  }
  fs.rmSync(stagedDir, { recursive: true, force: true });
  fs.mkdirSync(stagedDir, { recursive: true });

  // Both compilers take their output directory from a config file, and both let a flag override it
  run(path.join(path.dirname(require.resolve('tsdown/package.json')), 'dist', 'run.mjs'),
    ['--config', 'tsdown.config.ts', '--log-level', 'warn', '--out-dir', stagedDir]);

  // Typechecks the SFCs and emits declarations for them and the .ts modules
  run(require.resolve('vue-tsc/bin/vue-tsc.js'), ['-p', 'tsconfig.package.json', '--outDir', stagedDir]);
  // vue-tsc names SFC declarations X.vue.d.ts. TypeScript resolves an import of './X.vue' inside
  // another declaration file to X.d.vue.ts under node16/nodenext, so use that name.
  for (const file of walk(stagedDir).filter((f) => f.endsWith('.vue.d.ts'))) {
    fs.renameSync(file, file.replace(/\.vue\.d\.ts$/, '.d.vue.ts'));
  }

  // rewriteRelativeImportExtensions rewrites the emitted JS but not the declarations beside it
  rewriteDeclarationExtensions(stagedDir);

  // Every package the compiled modules import must be installable by a pack that uses them —
  // declarations included, since a type-only import is erased from the JS and would ship unseen
  const bareImports = new BareImports(stagedDir);
  for (const file of walk(stagedDir).filter((f) => f.endsWith('.js') || isDeclaration(f))) {
    const contents = fs.readFileSync(file, 'utf-8');
    if (isDeclaration(file)) bareImports.fromDeclaration(contents, file);
    else await bareImports.fromModule(contents, 'js', path.dirname(file), file);
  }
  bareImports.assertDeclared(pkg, 'packages/apack-ui/package.json');
  assertExportTargetsBuilt(pkgDir, pkg.exports, stagedDir);
  replaceDir(stagedDir, outDir);
  // What npm publishes: the derived manifest and a copy of what `files` names, checked against itself
  const treeDir = stagePublishTree(pkgDir, pkg);
  console.log(`Built ${pkg.name}@${pkg.version} into ${path.relative(process.cwd(), outDir)}`
    + `, staged for publishing in ${path.relative(process.cwd(), treeDir)}`);
}

// The build's own success stamp: written only if main() returns, and cleared before it touches dist
await runPackageBuild('@apack/ui', main);
