// Builds the publishable @abuddy/ui into dist/package: .vue and .css ship as source for the
// pack's Vite build, .ts modules as tsc-compiled ESM, and every module gets declarations from
// vue-tsc. The published exports map lists each module with its types; the workspace
// package.json keeps pointing at src so the monorepo needs no build step.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { BareImports, HOST_SHARED_PEERS, walk } from '../../../scripts/lib/published-imports.ts';

const pkgDir = path.resolve(import.meta.dirname, '..');
const srcDir = path.join(pkgDir, 'src');
const outDir = path.join(pkgDir, 'dist', 'package');
const require = createRequire(import.meta.url);
const run = (bin: string, args: string[]) => execFileSync(process.execPath, [bin, ...args], { stdio: 'inherit', cwd: pkgDir });

async function main(): Promise<void> {
  const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf-8'));
  const sdkVersion: string = JSON.parse(fs.readFileSync(path.join(pkgDir, '..', 'abuddy-sdk', 'package.json'), 'utf-8')).version;
  fs.rmSync(outDir, { recursive: true, force: true });

  const files = walk(srcDir);
  const tsSources = files.filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'));
  const sfcs = files.filter((f) => f.endsWith('.vue'));

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
  for (const file of sfcs) await bareImports.fromSfc(file);

  const exportsMap: Record<string, unknown> = { './package.json': './package.json' };
  for (const file of files.sort()) {
    const rel = `./${path.relative(srcDir, file)}`;
    if (tsSources.includes(file)) {
      const base = rel.replace(/\.ts$/, '');
      exportsMap[base] = { types: `${base}.d.ts`, default: `${base}.js` };
    } else if (file.endsWith('.vue')) {
      exportsMap[rel] = { types: rel.replace(/\.vue$/, '.d.vue.ts'), default: rel };
    }
  }
  for (const target of Object.values(exportsMap).filter((t) => t !== './package.json').flatMap((t) => (typeof t === 'string' ? [t] : Object.values(t as object)))) {
    if (!fs.existsSync(path.join(outDir, target))) throw new Error(`Export target ${target} was not built`);
  }

  const peerDependencies: Record<string, string> = {};
  for (const [name, range] of Object.entries(pkg.peerDependencies as Record<string, string>)) {
    peerDependencies[name] = name === '@abuddy/sdk' ? `^${sdkVersion}` : HOST_SHARED_PEERS[name] ?? range;
  }
  const manifest = {
    name: pkg.name,
    version: pkg.version,
    description: 'Vue components, editors and composables for AgentBuddy pack UIs',
    license: 'MIT',
    repository: { type: 'git', url: 'git+https://github.com/spankyed/AgentBuddy.git', directory: 'packages/abuddy-ui' },
    type: 'module',
    exports: exportsMap,
    dependencies: pkg.dependencies,
    peerDependencies,
    peerDependenciesMeta: pkg.peerDependenciesMeta,
    publishConfig: { access: 'public', provenance: true },
  };
  bareImports.assertDeclared(manifest, 'packages/abuddy-ui/package.json');
  fs.writeFileSync(path.join(outDir, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Built ${pkg.name}@${pkg.version} into ${path.relative(process.cwd(), outDir)}`);
}

await main();
