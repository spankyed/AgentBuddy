// Builds @abuddy/sdk's dist/: tsc-compiled ESM, declarations and maps. package.json is the
// published manifest; its exports resolve source under the @abuddy/source condition (monorepo
// tooling) and dist otherwise. Relative imports name the .ts source and tsc rewrites them to .js
// (rewriteRelativeImportExtensions), so the emitted JS resolves in Node and in bundlers as is.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { BareImports, assertExportTargetsBuilt, walk } from '../../../scripts/lib/published-imports.ts';

const pkgDir = path.resolve(import.meta.dirname, '..');
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

  // Every shipped module's imports must be installable by a pack that uses it
  const bareImports = new BareImports(outDir);
  for (const file of walk(outDir).filter((f) => f.endsWith('.js'))) {
    await bareImports.fromModule(fs.readFileSync(file, 'utf-8'), 'js', path.dirname(file), file);
  }
  bareImports.assertDeclared(pkg, 'packages/abuddy-sdk/package.json');
  assertExportTargetsBuilt(pkgDir, pkg.exports);
  console.log(`Built ${pkg.name}@${pkg.version} into ${path.relative(process.cwd(), outDir)}`);
}

await main();
