// Builds @abuddy/ui's dist/: .vue and .css ship as source for the pack's Vite build, .ts modules
// as tsc-compiled ESM, and every module gets declarations from vue-tsc. package.json is the
// published manifest; its exports resolve source under the @abuddy/source condition (monorepo
// tooling) and dist otherwise.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { BareImports, assertExportTargetsBuilt, walk } from '../../../scripts/lib/published-imports.ts';
import { computeExports, pkgDir } from './exports.ts';

const srcDir = path.join(pkgDir, 'src');
const outDir = path.join(pkgDir, 'dist');
const require = createRequire(import.meta.url);
const run = (bin: string, args: string[]) => execFileSync(process.execPath, [bin, ...args], { stdio: 'inherit', cwd: pkgDir });

async function main(): Promise<void> {
  const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf-8'));
  if (!isDeepStrictEqual(pkg.exports, computeExports())) {
    throw new Error('packages/abuddy-ui/package.json exports are out of date with src/. Run: npm run exports:update -w @abuddy/ui');
  }
  fs.rmSync(outDir, { recursive: true, force: true });

  const files = walk(srcDir);
  const tsSources = files.filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'));

  // Typechecks the SFCs and emits declarations for them and the .ts modules
  run(require.resolve('vue-tsc/bin/vue-tsc.js'), ['-p', 'tsconfig.package.json']);
  // vue-tsc names SFC declarations X.vue.d.ts. TypeScript resolves an import of './X.vue' inside
  // another declaration file to X.d.vue.ts under node16/nodenext, so use that name.
  for (const file of walk(outDir).filter((f) => f.endsWith('.vue.d.ts'))) {
    fs.renameSync(file, file.replace(/\.vue\.d\.ts$/, '.d.vue.ts'));
  }
  // JS for the .ts modules; vue-tsc has already checked them
  run(require.resolve('typescript/bin/tsc'), ['-p', 'tsconfig.package.json', '--emitDeclarationOnly', 'false', '--declaration', 'false', '--noCheck']);

  for (const file of files.filter((f) => !tsSources.includes(f))) {
    const dest = path.join(outDir, path.relative(srcDir, file));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(file, dest);
  }

  const bareImports = new BareImports(srcDir);
  for (const source of tsSources) {
    const emitted = path.join(outDir, path.relative(srcDir, source)).replace(/\.ts$/, '.js');
    await bareImports.fromModule(fs.readFileSync(emitted, 'utf-8'), 'js', path.dirname(emitted), source);
  }
  for (const file of files.filter((f) => f.endsWith('.vue'))) await bareImports.fromSfc(file);
  bareImports.assertDeclared(pkg, 'packages/abuddy-ui/package.json');
  assertExportTargetsBuilt(pkgDir, pkg.exports);
  console.log(`Built ${pkg.name}@${pkg.version} into ${path.relative(process.cwd(), outDir)}`);
}

await main();
