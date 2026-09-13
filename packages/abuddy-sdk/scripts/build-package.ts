// Builds the publishable @abuddy/sdk into dist/package: compiled ESM, declarations and a
// package.json whose exports map only the pack-facing entry points. The workspace
// package.json keeps pointing at src so the monorepo needs no build step.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { builtinModules } from 'node:module';
import { build, type Plugin } from 'esbuild';
import { parse as parseSfc } from '@vue/compiler-sfc';

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

/** Shared with the running app: packs must use the host's copy, so they are peers with host ranges. */
const HOST_SHARED_PEERS: Record<string, string> = {
  vue: '^3.5.18',
  xstate: '^5.19.2',
  '@xstate/vue': '^4.0.2',
  'lucide-vue-next': '^0.503.0',
  'reka-ui': '^2.2.1',
  zod: '^3.24.0',
  '@tiptap/core': '^3.20.1',
  '@tiptap/pm': '^3.20.1',
  '@tiptap/starter-kit': '^3.20.1',
  '@tiptap/vue-3': '^3.20.1',
  '@vue-flow/core': '^1.44.0',
};

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

/** Package name → files importing it, from every shipped module (compiled .ts and .vue scripts). */
const bareImports = new Map<string, Set<string>>();
const packageName = (specifier: string) =>
  specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0];

function recordBareImport(specifier: string, importer: string): void {
  const name = packageName(specifier);
  if (!bareImports.has(name)) bareImports.set(name, new Set());
  bareImports.get(name)!.add(path.relative(srcDir, importer));
}

// Keep every module a separate file (one copy of shared state such as the host module
// registry) and make relative imports Node-resolvable by pointing them at the emitted .js
const relativeImportsToJs: Plugin = {
  name: 'relative-imports-to-js',
  setup(b) {
    b.onResolve({ filter: /.*/ }, (args) => {
      if (args.kind === 'entry-point') return undefined;
      if (!args.path.startsWith('.')) {
        recordBareImport(args.path, args.importer);
        return { path: args.path, external: true };
      }
      const target = path.resolve(args.resolveDir, args.path);
      if (fs.existsSync(target) && fs.statSync(target).isFile()) {
        return { path: args.path.replace(/\.ts$/, '.js'), external: true };
      }
      for (const [suffix, emitted] of [['.ts', '.js'], ['/index.ts', '/index.js']] as const) {
        if (fs.existsSync(target + suffix)) return { path: args.path + emitted, external: true };
      }
      throw new Error(`Unresolvable import ${args.path} in ${args.importer}`);
    });
  },
};

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

  await build({
    entryPoints: tsSources,
    outdir: outDir,
    outbase: srcDir,
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    logLevel: 'warning',
    plugins: [relativeImportsToJs],
  });

  // SFC scripts are compiled by the pack's build, so their imports must be installable too.
  // verbatimModuleSyntax keeps imports only the template uses; `import type` is still dropped.
  for (const file of files.filter((f) => f.endsWith('.vue'))) {
    const { descriptor } = parseSfc(fs.readFileSync(file, 'utf-8'), { filename: file });
    for (const block of [descriptor.script, descriptor.scriptSetup]) {
      if (!block) continue;
      await build({
        stdin: { contents: block.content, loader: block.lang === 'ts' ? 'ts' : 'js', resolveDir: path.dirname(file), sourcefile: file },
        bundle: true,
        write: false,
        logLevel: 'silent',
        tsconfigRaw: { compilerOptions: { verbatimModuleSyntax: true } },
        plugins: [{
          name: 'collect-sfc-imports',
          setup(b) {
            b.onResolve({ filter: /^[^./]/ }, (args) => {
              recordBareImport(args.path, file);
              return { path: args.path, external: true };
            });
            b.onResolve({ filter: /^\./ }, (args) => ({ path: args.path, external: true }));
          },
        }],
      });
    }
  }

  // Vue SFCs, CSS and hand-written declarations ship as source; the pack's Vite build compiles them
  for (const file of files.filter((f) => !tsSources.includes(f))) {
    const dest = path.join(outDir, path.relative(srcDir, file));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(file, dest);
  }

  execFileSync(
    process.execPath,
    [createRequire(import.meta.url).resolve('typescript/bin/tsc'), '-p', path.join(pkgDir, 'tsconfig.package.json')],
    { stdio: 'inherit' },
  );

  // tsc keeps extensionless relative specifiers in declarations, which moduleResolution
  // node16/nodenext consumers can't resolve; point them at the emitted .js like the JS output
  for (const file of walk(outDir).filter((f) => f.endsWith('.d.ts'))) {
    const source = fs.readFileSync(file, 'utf-8');
    const rewritten = source.replace(/(\bfrom\s*|\bimport\s*\(\s*)(['"])(\.{1,2}\/[^'"]*)\2/g, (match, prefix, quote, specifier, offset: number) => {
      if (/\.(js|vue|css|json)$/.test(specifier)) return match;
      const line = source.slice(source.lastIndexOf('\n', offset) + 1, offset);
      if (/^\s*(\*|\/\/)/.test(line)) return match; // doc comment example
      const target = path.resolve(path.dirname(file), specifier);
      if (fs.existsSync(`${target}.d.ts`)) return `${prefix}${quote}${specifier}.js${quote}`;
      if (fs.existsSync(path.join(target, 'index.d.ts'))) return `${prefix}${quote}${specifier}/index.js${quote}`;
      throw new Error(`Unresolvable import ${specifier} in ${path.relative(outDir, file)}`);
    });
    if (rewritten !== source) fs.writeFileSync(file, rewritten);
  }

  fs.copyFileSync(path.join(pkgDir, 'abuddy.schema.json'), path.join(outDir, 'abuddy.schema.json'));

  const dependencies = Object.fromEntries(
    Object.entries(pkg.dependencies as Record<string, string>).filter(([name]) => !(name in HOST_SHARED_PEERS)),
  );
  const peerDependencies = { ...pkg.peerDependencies, ...HOST_SHARED_PEERS };

  // Every package a shipped module imports must be installable by a pack that uses it
  const declared = new Set([pkg.name, ...Object.keys(dependencies), ...Object.keys(peerDependencies)]);
  const builtins = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)]);
  const undeclared = [...bareImports].filter(([name]) => !declared.has(name) && !builtins.has(name));
  if (undeclared.length > 0) {
    throw new Error(
      'Shipped @abuddy/sdk modules import packages the published manifest does not declare:\n' +
      undeclared.map(([name, importers]) => `  ${name} <- ${[...importers].slice(0, 3).join(', ')}`).join('\n') +
      '\nAdd them to packages/abuddy-sdk/package.json dependencies (or peerDependencies for host-shared libraries).',
    );
  }
  const optionalPeers = Object.fromEntries(
    Object.keys(peerDependencies)
      // npm installs required peers: pack builds read host-shared libraries' exports, and types come from them
      .filter((name) => !(name in HOST_SHARED_PEERS))
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
