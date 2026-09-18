// Builds a workspace package's dist/ with tsc: ESM and declarations, no source maps (src doesn't ship).
// @abuddy/ears and @abuddy/sdk are built exactly alike, so they share this script the way the bundled
// packages share bundle-package.ts:
//
//   tsx ../../scripts/build-package.ts .        (from the package directory)
//
// A package's package.json is its published manifest; its exports resolve source under the
// @abuddy/source condition (the repo's own configs) and dist otherwise. Relative imports name the .ts
// source and tsc rewrites them to .js (rewriteRelativeImportExtensions), so the emitted JS resolves in
// Node and in bundlers as is.
//
// It lives here rather than in each package because it reads the repo's build rule
// (@abuddy/host/build/packages-built), and a package's own scripts import no package above their layer.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { BareImports, assertExportTargetsBuilt, isDeclaration, rewriteDeclarationExtensions, walk } from './lib/published-imports.ts';
import { runPackageBuild } from '@abuddy/host/build/packages-built';

const repoRoot = path.resolve(import.meta.dirname, '..');
const pkgDir = path.resolve(process.argv[2] ?? '');
const srcDir = path.join(pkgDir, 'src');
const outDir = path.join(pkgDir, 'dist');

async function main(): Promise<void> {
  const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf-8'));
  fs.rmSync(outDir, { recursive: true, force: true });

  execFileSync(
    process.execPath,
    [createRequire(import.meta.url).resolve('typescript/bin/tsc'), '-p', path.join(pkgDir, 'tsconfig.package.json')],
    { stdio: 'inherit' },
  );

  // Hand-written declarations ship as source
  for (const file of walk(srcDir).filter((f) => f.endsWith('.d.ts'))) {
    const dest = path.join(outDir, path.relative(srcDir, file));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(file, dest);
  }

  // rewriteRelativeImportExtensions rewrites the emitted JS but not the declarations beside it
  rewriteDeclarationExtensions(outDir);

  // Every shipped module's imports must be installable by a pack that uses it — declarations included,
  // because a type-only import is erased from the JS, so an undeclared dependency would ship unseen
  const bareImports = new BareImports(outDir);
  for (const file of walk(outDir).filter((f) => f.endsWith('.js') || isDeclaration(f))) {
    const contents = fs.readFileSync(file, 'utf-8');
    if (isDeclaration(file)) bareImports.fromDeclaration(contents, file);
    else await bareImports.fromModule(contents, 'js', path.dirname(file), file);
  }
  bareImports.assertDeclared(pkg, path.join(path.relative(repoRoot, pkgDir), 'package.json'));
  assertExportTargetsBuilt(pkgDir, pkg.exports);
  console.log(`Built ${pkg.name}@${pkg.version} into ${path.relative(process.cwd(), outDir)}`);
}

// The build's own success stamp: written only if main() returns, and cleared before it touches dist
await runPackageBuild(JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf-8')).name, main);
