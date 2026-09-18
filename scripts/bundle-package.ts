// Builds a publishable copy of a workspace package that ships as a bundle (@abuddy/cli,
// @abuddy/testing) into <package>/dist/package. The shared-instance packages (SHARED_INSTANCE_PACKAGES)
// and the private @abuddy/host are inlined from source, so the published package can use host-only
// modules; every other package stays external and becomes a dependency at the version the workspace uses.
//
//   tsx scripts/bundle-package.ts packages/abuddy-cli
import * as fs from 'node:fs';
import * as path from 'node:path';
import { builtinModules, createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { packageName } from './lib/published-imports.ts';
import { runPackageBuild } from './ensure-packages-built.ts';
import { SHARED_INSTANCE_PACKAGES } from '@abuddy/host/build/shared-deps';
import { build, type BuildOptions, type Plugin } from 'esbuild';

interface BundleConfig {
  /** Entry name (output dist/<name>.js) → source file, relative to the package */
  entries: Record<string, string>;
  /**
   * Entries bundled with the shared-instance packages external instead of inlined: they run inside a
   * pack's process and must share the pack's installed instances (the SDK's registries, the EARS
   * engine), not carry their own copies: the published package declares them as peer dependencies.
   */
  sharedExternalEntries?: Record<string, string>;
  /** Extra files copied verbatim into the published package */
  copy?: string[];
  /** Emit dist/<entry>.d.ts for each entry */
  declarations?: boolean;
  /** Fields replacing the workspace ones in the published package.json */
  manifest: Record<string, unknown>;
}

const CONFIGS: Record<string, BundleConfig> = {
  '@abuddy/cli': {
    entries: { cli: 'src/index.ts' },
    copy: ['bin/abuddy.mjs'],
    manifest: { bin: { abuddy: 'bin/abuddy.mjs' } },
  },
  '@abuddy/testing': {
    // vitest-worker and vitest-teardown are loaded by path from dist/vitest.js's isolatedDataDir()
    entries: { index: 'src/index.ts', vitest: 'src/vitest.ts', 'vitest-worker': 'src/vitest-worker.ts', 'vitest-teardown': 'src/vitest-teardown.ts' },
    sharedExternalEntries: { harness: 'src/harness.ts' },
    declarations: true,
    manifest: { exports: {
      '.': { types: './dist/index.d.ts', default: './dist/index.js' },
      './vitest': { types: './dist/vitest.d.ts', default: './dist/vitest.js' },
      './harness': { types: './dist/harness.d.ts', default: './dist/harness.js' },
    } },
  },
};

const repoRoot = path.resolve(import.meta.dirname, '..');
const pkgDir = path.resolve(process.argv[2] ?? '');
const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf-8'));
const config = CONFIGS[pkg.name];
if (!config) throw new Error(`No bundle config for ${pkg.name}`);

const outDir = path.join(pkgDir, 'dist', 'package');
const workspaceManifest = (name: string) =>
  JSON.parse(fs.readFileSync(createRequire(path.join(repoRoot, 'package.json')).resolve(`${name}/package.json`), 'utf-8'));
const sharedPkgs = SHARED_INSTANCE_PACKAGES.map(workspaceManifest);
const hostPkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'packages', 'abuddy-host', 'package.json'), 'utf-8'));
const SHARED = new Set<string>(SHARED_INSTANCE_PACKAGES);
const INLINED = new Set([...SHARED, '@abuddy/host']);

const builtins = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)]);

const externalizeAllButInlined: Plugin = {
  name: 'externalize-all-but-inlined',
  setup(b) {
    b.onResolve({ filter: /^[^./]/ }, (args) => {
      if (args.kind === 'entry-point' || INLINED.has(packageName(args.path))) return undefined;
      return { path: args.path, external: true };
    });
  },
};

function versionOf(name: string): string {
  // The package's own ranges win; inlined shared-instance and host code brings their ranges
  const sources = [pkg.dependencies, pkg.peerDependencies, ...sharedPkgs.flatMap((p) => [p.dependencies, p.peerDependencies]), hostPkg.dependencies];
  for (const source of sources) {
    if (source?.[name]) return source[name];
  }
  throw new Error(`${pkg.name} bundle imports ${name}, which neither ${pkg.name}, the shared-instance packages nor @abuddy/host declares`);
}

const externalizeAllButHost: Plugin = {
  name: 'externalize-all-but-host',
  setup(b) {
    b.onResolve({ filter: /^[^./]/ }, (args) => {
      if (args.kind === 'entry-point' || packageName(args.path) === '@abuddy/host') return undefined;
      return { path: args.path, external: true };
    });
  },
};

const sharedOptions = {
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  metafile: true,
  logLevel: 'warning',
  conditions: ['@abuddy/source', 'module'],
  banner: { js: "import { createRequire as __abuddyCreateRequire } from 'node:module'; const require = __abuddyCreateRequire(import.meta.url);" },
} satisfies BuildOptions;

async function main(): Promise<void> {
  fs.rmSync(outDir, { recursive: true, force: true });

  const sharedExternal = config.sharedExternalEntries && await build({
    ...sharedOptions,
    entryPoints: Object.fromEntries(Object.entries(config.sharedExternalEntries).map(([name, src]) => [name, path.join(pkgDir, src)])),
    outdir: path.join(outDir, 'dist'),
    plugins: [externalizeAllButHost],
  });

  const result = await build({
    entryPoints: Object.fromEntries(Object.entries(config.entries).map(([name, src]) => [name, path.join(pkgDir, src)])),
    outdir: path.join(outDir, 'dist'),
    bundle: true,
    splitting: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    metafile: true,
    logLevel: 'warning',
    // Inlined workspace packages bundle from source (see their package.json exports)
    conditions: ['@abuddy/source', 'module'],
    // Bundled CommonJS dependencies may call require(); give ESM chunks one
    banner: { js: "import { createRequire as __abuddyCreateRequire } from 'node:module'; const require = __abuddyCreateRequire(import.meta.url);" },
    plugins: [externalizeAllButInlined],
  });

  const imported = new Set<string>();
  for (const output of [...Object.values(result.metafile.outputs), ...Object.values(sharedExternal?.metafile?.outputs ?? {})]) {
    for (const imp of output.imports) {
      if (imp.external && !builtins.has(imp.path)) imported.add(packageName(imp.path));
    }
  }

  // Declared dependencies stay (some are only loaded by other dependencies, e.g. vue for
  // @vitejs/plugin-vue); packages the inlined SDK code imports are added
  const peers = new Set(Object.keys(pkg.peerDependencies ?? {}));
  const dependencies: Record<string, string> = { ...pkg.dependencies };
  for (const name of imported) {
    if (!peers.has(name) && !SHARED.has(name)) dependencies[name] ??= versionOf(name);
  }
  const peerDependencies: Record<string, string> = { ...pkg.peerDependencies };
  for (const shared of sharedPkgs) {
    if (config.sharedExternalEntries && imported.has(shared.name)) {
      // Those entries run on the pack's installed instances: a peer, so the package never brings its own copy
      delete dependencies[shared.name];
      peerDependencies[shared.name] = `^${shared.version}`;
    } else if (dependencies[shared.name]) {
      // Packs build against the version released with this package
      dependencies[shared.name] = shared.version;
    }
  }
  // The private host package is inlined, never installed
  delete dependencies['@abuddy/host'];

  for (const file of config.copy ?? []) {
    const dest = path.join(outDir, file);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(pkgDir, file), dest);
  }

  if (config.declarations) {
    const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');
    const entryFiles = [...Object.values(config.entries), ...Object.values(config.sharedExternalEntries ?? {})].map((src) => path.join(pkgDir, src));
    execFileSync(process.execPath, [
      tsc, ...entryFiles, '--declaration', '--emitDeclarationOnly', '--outDir', path.join(outDir, 'dist'),
      '--module', 'esnext', '--moduleResolution', 'bundler', '--customConditions', '@abuddy/source', '--allowImportingTsExtensions', '--target', 'es2022',
      '--strict', '--esModuleInterop', '--skipLibCheck', '--types', 'node',
    ], { stdio: 'inherit' });
  }

  const manifest = {
    name: pkg.name,
    version: pkg.version,
    description: pkg.description,
    license: 'MIT',
    repository: { type: 'git', url: 'git+https://github.com/spankyed/AgentBuddy.git', directory: `packages/${path.basename(pkgDir)}` },
    type: 'module',
    engines: pkg.engines,
    ...config.manifest,
    dependencies: Object.fromEntries(Object.entries(dependencies).sort(([a], [b]) => a.localeCompare(b))),
    peerDependencies: Object.keys(peerDependencies).length > 0 ? peerDependencies : undefined,
    peerDependenciesMeta: pkg.peerDependenciesMeta,
    publishConfig: { access: 'public', provenance: true },
  };
  fs.writeFileSync(path.join(outDir, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Built ${pkg.name}@${pkg.version} into ${path.relative(process.cwd(), outDir)}`);
}

// The build's own success stamp: written only if main() returns, and cleared before it touches dist/package
await runPackageBuild(pkg.name, main);
