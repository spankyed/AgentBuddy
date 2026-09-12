import * as fs from 'node:fs';
import * as path from 'node:path';
import { getSharedBeDeps } from './shared-deps';
import type { PackManifest } from './manifest';

export async function bundlePackSystems(
  manifest: PackManifest,
  packDir: string,
  outputDir: string,
): Promise<{ compiled: string[] }> {
  const features = manifest.features ?? [];
  const systemEntries = features
    .filter(f => f.system?.entry)
    .map(f => ({ id: f.id, entry: f.system!.entry }));

  if (systemEntries.length === 0) return { compiled: [] };

  const esbuild = await import('esbuild');
  const systemsDir = path.join(outputDir, 'systems');
  fs.mkdirSync(systemsDir, { recursive: true });

  const externals = [
    ...getSharedBeDeps(),
    '@abuddy/sdk',
    '@abuddy/sdk/*',
  ];

  const tsconfigPath = path.join(packDir, 'tsconfig.json');
  const aliases = readTsconfigAliases(packDir);
  const subpathImports = readSubpathImports(packDir);
  const resolvePlugins: import('esbuild').Plugin[] = [];
  if (Object.keys(aliases).length > 0) resolvePlugins.push(makeAliasPlugin(aliases));
  if (Object.keys(subpathImports).length > 0) resolvePlugins.push(makeSubpathPlugin(subpathImports, packDir));

  const compiled: string[] = [];
  for (const { id, entry } of systemEntries) {
    const entryPath = path.resolve(packDir, entry);
    if (!fs.existsSync(entryPath)) continue;

    const outFile = path.join(systemsDir, `${id}.cjs`);
    try {
      await esbuild.build({
        entryPoints: [entryPath],
        bundle: true,
        format: 'cjs',
        platform: 'node',
        target: 'node20',
        outfile: outFile,
        external: externals,
        tsconfig: fs.existsSync(tsconfigPath) ? tsconfigPath : undefined,
        plugins: resolvePlugins,
        logLevel: 'warning',
      });
      compiled.push(id);
    } catch (err) {
      console.error(`Failed to compile system ${id}:`, err);
    }
  }

  return { compiled };
}

function readTsconfigAliases(packDir: string): Record<string, string> {
  const aliases: Record<string, string> = {};
  const tsconfigPath = path.join(packDir, 'tsconfig.json');
  if (!fs.existsSync(tsconfigPath)) return aliases;
  try {
    const raw = fs.readFileSync(tsconfigPath, 'utf-8').replace(/\/\/.*/g, '').replace(/,\s*([}\]])/g, '$1');
    const tsconfig = JSON.parse(raw);
    const paths: Record<string, string[]> = tsconfig.compilerOptions?.paths ?? {};
    for (const [pattern, targets] of Object.entries(paths)) {
      if (!pattern.endsWith('/*') || !targets[0]?.endsWith('/*')) continue;
      const alias = pattern.slice(0, -2);
      const target = targets[0].slice(0, -2);
      aliases[alias] = path.resolve(packDir, target);
    }
  } catch {}
  return aliases;
}

function readSubpathImports(packDir: string): Record<string, string> {
  const imports: Record<string, string> = {};
  const pkgPath = path.join(packDir, 'package.json');
  if (!fs.existsSync(pkgPath)) return imports;
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const pkgImports: Record<string, string> = pkg.imports ?? {};
    for (const [pattern, target] of Object.entries(pkgImports)) {
      if (typeof target === 'string') {
        imports[pattern] = target;
      } else if (typeof target === 'object' && target !== null) {
        const resolved = (target as Record<string, string>).default
          ?? (target as Record<string, string>).require
          ?? (target as Record<string, string>).node;
        if (typeof resolved === 'string') imports[pattern] = resolved;
      }
    }
  } catch {}
  return imports;
}

function resolveWithExtensions(base: string): string | undefined {
  for (const ext of ['', '.ts', '.js', '.mts', '.mjs']) {
    const p = base + ext;
    if (fs.existsSync(p)) return p;
  }
  const indexTs = path.join(base, 'index.ts');
  if (fs.existsSync(indexTs)) return indexTs;
  return undefined;
}

function makeSubpathPlugin(imports: Record<string, string>, packDir: string): import('esbuild').Plugin {
  return {
    name: 'subpath-imports',
    setup(build) {
      build.onResolve({ filter: /^#/ }, args => {
        for (const [pattern, target] of Object.entries(imports)) {
          if (pattern.endsWith('/*') && target.endsWith('/*')) {
            const prefix = pattern.slice(0, -1);
            if (args.path.startsWith(prefix)) {
              const rest = args.path.slice(prefix.length);
              const resolved = resolveWithExtensions(path.resolve(packDir, target.slice(0, -1) + rest));
              if (resolved) return { path: resolved };
            }
          } else if (pattern === args.path) {
            const resolved = resolveWithExtensions(path.resolve(packDir, target));
            if (resolved) return { path: resolved };
          }
        }
        return undefined;
      });
    },
  };
}

function makeAliasPlugin(aliases: Record<string, string>): import('esbuild').Plugin {
  return {
    name: 'tsconfig-aliases',
    setup(build) {
      for (const [prefix, target] of Object.entries(aliases)) {
        const filter = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/`);
        build.onResolve({ filter }, args => {
          const rest = args.path.slice(prefix.length + 1);
          return { path: path.resolve(target, rest) };
        });
      }
    },
  };
}
