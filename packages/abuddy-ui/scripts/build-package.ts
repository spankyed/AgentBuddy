// Builds @abuddy/ui's dist/: tsdown compiles the components and modules to ESM (with the CSS
// each component imports), and vue-tsc typechecks them and emits per-module declarations.
// package.json is the published manifest; its exports resolve source under the @abuddy/source
// condition (monorepo tooling) and dist otherwise.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { BareImports, assertExportTargetsBuilt, walk } from '../../../scripts/lib/published-imports.ts';
import { computeExports, pkgDir } from './exports.ts';

const outDir = path.join(pkgDir, 'dist');
const require = createRequire(import.meta.url);
const run = (bin: string, args: string[]) => execFileSync(process.execPath, [bin, ...args], { stdio: 'inherit', cwd: pkgDir });

async function main(): Promise<void> {
  const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf-8'));
  if (!isDeepStrictEqual(pkg.exports, computeExports())) {
    throw new Error('packages/abuddy-ui/package.json exports are out of date with src/. Run: npm run exports:update -w @abuddy/ui');
  }
  fs.rmSync(outDir, { recursive: true, force: true });

  run(path.join(path.dirname(require.resolve('tsdown/package.json')), 'dist', 'run.mjs'), ['--config', 'tsdown.config.ts', '--log-level', 'warn']);

  // Typechecks the SFCs and emits declarations for them and the .ts modules
  run(require.resolve('vue-tsc/bin/vue-tsc.js'), ['-p', 'tsconfig.package.json']);
  // vue-tsc names SFC declarations X.vue.d.ts. TypeScript resolves an import of './X.vue' inside
  // another declaration file to X.d.vue.ts under node16/nodenext, so use that name.
  for (const file of walk(outDir).filter((f) => f.endsWith('.vue.d.ts'))) {
    fs.renameSync(file, file.replace(/\.vue\.d\.ts$/, '.d.vue.ts'));
  }

  // Every package the compiled modules import must be installable by a pack that uses them
  const bareImports = new BareImports(outDir);
  for (const file of walk(outDir).filter((f) => f.endsWith('.js'))) {
    await bareImports.fromModule(fs.readFileSync(file, 'utf-8'), 'js', path.dirname(file), file);
  }
  bareImports.assertDeclared(pkg, 'packages/abuddy-ui/package.json');
  assertExportTargetsBuilt(pkgDir, pkg.exports);
  console.log(`Built ${pkg.name}@${pkg.version} into ${path.relative(process.cwd(), outDir)}`);
}

await main();
