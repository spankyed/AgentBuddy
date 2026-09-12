// Builds a publishable copy of a workspace package that ships as a bundle (@abuddy/cli,
// @abuddy/testing) into <package>/dist/package. @abuddy/sdk is inlined, so the published
// package can use host-only SDK modules that the public SDK exports map leaves out; every
// other package stays external and becomes a dependency at the version the workspace uses.
//
//   tsx scripts/bundle-package.ts packages/abuddy-cli
import * as fs from 'node:fs';
import * as path from 'node:path';
import { builtinModules, createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { build, type Plugin } from 'esbuild';

interface BundleConfig {
  /** Entry name (output dist/<name>.js) → source file, relative to the package */
  entries: Record<string, string>;
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
    entries: { index: 'src/index.ts' },
    declarations: true,
    manifest: { exports: { '.': { types: './dist/index.d.ts', default: './dist/index.js' } } },
  },
};

const repoRoot = path.resolve(import.meta.dirname, '..');
const pkgDir = path.resolve(process.argv[2] ?? '');
const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf-8'));
const config = CONFIGS[pkg.name];
if (!config) throw new Error(`No bundle config for ${pkg.name}`);

const outDir = path.join(pkgDir, 'dist', 'package');
const sdkPkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'packages', 'abuddy-sdk', 'package.json'), 'utf-8'));

const builtins = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)]);
const packageName = (specifier: string) =>
  specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0];

const externalizeAllButSdk: Plugin = {
  name: 'externalize-all-but-sdk',
  setup(b) {
    b.onResolve({ filter: /^[^./]/ }, (args) => {
      if (args.kind === 'entry-point' || packageName(args.path) === '@abuddy/sdk') return undefined;
      return { path: args.path, external: true };
    });
  },
};

function versionOf(name: string): string {
  // The package's own ranges win; inlined SDK code brings the SDK's ranges
  for (const source of [pkg.dependencies, pkg.peerDependencies, sdkPkg.dependencies, sdkPkg.peerDependencies]) {
    if (source?.[name]) return source[name];
  }
  throw new Error(`${pkg.name} bundle imports ${name}, which neither ${pkg.name} nor @abuddy/sdk declares`);
}

fs.rmSync(outDir, { recursive: true, force: true });

const result = await build({
  entryPoints: Object.fromEntries(Object.entries(config.entries).map(([name, src]) => [name, path.join(pkgDir, src)])),
  outdir: path.join(outDir, 'dist'),
  bundle: true,
  splitting: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  metafile: true,
  logLevel: 'warning',
  // Bundled CommonJS dependencies may call require(); give ESM chunks one
  banner: { js: "import { createRequire as __abuddyCreateRequire } from 'node:module'; const require = __abuddyCreateRequire(import.meta.url);" },
  plugins: [externalizeAllButSdk],
});

const imported = new Set<string>();
for (const output of Object.values(result.metafile.outputs)) {
  for (const imp of output.imports) {
    if (imp.external && !builtins.has(imp.path)) imported.add(packageName(imp.path));
  }
}

// Declared dependencies stay (some are only loaded by other dependencies, e.g. vue for
// @vitejs/plugin-vue); packages the inlined SDK code imports are added
const peers = new Set(Object.keys(pkg.peerDependencies ?? {}));
const dependencies: Record<string, string> = { ...pkg.dependencies };
for (const name of imported) {
  if (!peers.has(name)) dependencies[name] ??= versionOf(name);
}
// Packs build against the SDK version released with this package
if (dependencies['@abuddy/sdk']) dependencies['@abuddy/sdk'] = sdkPkg.version;

for (const file of config.copy ?? []) {
  const dest = path.join(outDir, file);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(path.join(pkgDir, file), dest);
}

if (config.declarations) {
  const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');
  const entryFiles = Object.values(config.entries).map((src) => path.join(pkgDir, src));
  execFileSync(process.execPath, [
    tsc, ...entryFiles, '--declaration', '--emitDeclarationOnly', '--outDir', path.join(outDir, 'dist'),
    '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'es2022',
    '--strict', '--esModuleInterop', '--skipLibCheck', '--types', 'node',
  ], { stdio: 'inherit' });
}

const manifest = {
  name: pkg.name,
  version: pkg.version,
  description: pkg.description,
  type: 'module',
  engines: pkg.engines,
  ...config.manifest,
  dependencies: Object.fromEntries(Object.entries(dependencies).sort(([a], [b]) => a.localeCompare(b))),
  peerDependencies: pkg.peerDependencies,
  publishConfig: { access: 'public', provenance: true },
};
fs.writeFileSync(path.join(outDir, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Built ${pkg.name}@${pkg.version} into ${path.relative(process.cwd(), outDir)}`);
