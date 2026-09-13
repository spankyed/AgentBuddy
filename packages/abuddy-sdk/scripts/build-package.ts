// Builds the publishable @abuddy/sdk into dist/package: tsc-compiled ESM, declarations and a
// package.json whose exports map only the pack-facing entry points. The workspace
// package.json keeps pointing at src so the monorepo needs no build step. Sources use
// explicit .js specifiers (the nodenext typecheck enforces it), so tsc's output resolves in
// Node and in node16/bundler consumers as emitted.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { BareImports, HOST_SHARED_PEERS, walk } from '../../../scripts/lib/published-imports.ts';

const pkgDir = path.resolve(import.meta.dirname, '..');
const srcDir = path.join(pkgDir, 'src');
const outDir = path.join(pkgDir, 'dist', 'package');

/** Host-only entry points: the app uses them from source, packs never import them. */
const HOST_ONLY_EXPORTS = new Set([
  './ears/internals',
  './fe/host',
  './fe/pack-store',
  './persistence',
  './backup',
  './packs',
  './build/discover',
  './build/shared-deps',
  './testing',
]);

/** Host-shared libraries the SDK imports. The tiptap ones are types for editor plugin contracts only. */
const REQUIRED_HOST_PEERS = ['vue', 'xstate', 'zod'];
const TYPE_ONLY_HOST_PEERS = ['@tiptap/pm', '@tiptap/vue-3'];

function publicExports(exportsMap: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, target] of Object.entries(exportsMap)) {
    if (HOST_ONLY_EXPORTS.has(key)) continue;
    if (!target.startsWith('./src/')) {
      out[key] = target;
      continue;
    }
    if (!target.includes('*') && !fs.existsSync(path.join(pkgDir, target))) {
      throw new Error(`Export ${key} points at missing ${target}`);
    }
    const rel = target.slice('./src/'.length);
    out[key] = rel.endsWith('.ts')
      ? { types: `./${rel.replace(/\.ts$/, '.d.ts')}`, default: `./${rel.replace(/\.ts$/, '.js')}` }
      : `./${rel}`;
  }
  return out;
}

async function main(): Promise<void> {
  const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf-8'));
  fs.rmSync(outDir, { recursive: true, force: true });

  const files = walk(srcDir).filter((f) => !path.relative(srcDir, f).startsWith('testing'));
  const tsSources = files.filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'));

  execFileSync(
    process.execPath,
    [createRequire(import.meta.url).resolve('typescript/bin/tsc'), '-p', path.join(pkgDir, 'tsconfig.package.json')],
    { stdio: 'inherit' },
  );

  // Every shipped module's imports must be installable by a pack that uses it
  const bareImports = new BareImports(srcDir);
  for (const source of tsSources) {
    const emitted = path.join(outDir, path.relative(srcDir, source)).replace(/\.ts$/, '.js');
    await bareImports.fromModule(fs.readFileSync(emitted, 'utf-8'), 'js', path.dirname(emitted), source);
  }

  // Hand-written declarations ship as source
  for (const file of files.filter((f) => !tsSources.includes(f))) {
    const dest = path.join(outDir, path.relative(srcDir, file));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(file, dest);
  }

  fs.copyFileSync(path.join(pkgDir, 'abuddy.schema.json'), path.join(outDir, 'abuddy.schema.json'));

  const hostPeers = [...REQUIRED_HOST_PEERS, ...TYPE_ONLY_HOST_PEERS];
  const dependencies = Object.fromEntries(
    Object.entries(pkg.dependencies as Record<string, string>).filter(([name]) => !hostPeers.includes(name)),
  );
  const peerDependencies = {
    ...pkg.peerDependencies,
    ...Object.fromEntries(hostPeers.map((name) => [name, HOST_SHARED_PEERS[name]])),
  };
  bareImports.assertDeclared({ name: pkg.name, dependencies, peerDependencies }, 'packages/abuddy-sdk/package.json');
  const optionalPeers = Object.fromEntries(
    Object.keys(peerDependencies)
      // npm installs required peers: pack builds read host-shared libraries' exports, and types come from them
      .filter((name) => !REQUIRED_HOST_PEERS.includes(name))
      .map((name) => [name, { optional: true }]),
  );

  const manifest = {
    name: pkg.name,
    version: pkg.version,
    description: 'Pack-facing API and types for AgentBuddy packs',
    license: 'MIT',
    repository: { type: 'git', url: 'git+https://github.com/spankyed/AgentBuddy.git', directory: 'packages/abuddy-sdk' },
    type: 'module',
    exports: { ...publicExports(pkg.exports), './abuddy.schema.json': './abuddy.schema.json' },
    dependencies,
    peerDependencies,
    peerDependenciesMeta: optionalPeers,
    publishConfig: { access: 'public', provenance: true },
  };
  fs.writeFileSync(path.join(outDir, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Built ${pkg.name}@${pkg.version} into ${path.relative(process.cwd(), outDir)}`);
}

await main();
