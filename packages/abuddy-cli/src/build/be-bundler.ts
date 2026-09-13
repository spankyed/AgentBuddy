import * as fs from 'node:fs';
import * as path from 'node:path';
import { SHARED_DEPS } from '@abuddy/host/build/shared-deps';

export interface BundleRuntimeOptions {
  /** Minify for release bundles; dev builds keep readable output with source maps. */
  release?: boolean;
}

/**
 * Bundle the pack's generated backend entry (src/__generated__/pack-entry.ts) into
 * dist/runtime/index.cjs. It exports `registration` (systems, services, steps,
 * artifacts, blocks, EARS, boot hooks, migrations) and `setCompiledDir`, the same
 * contract built-in packs use. Host-provided packages and @abuddy/sdk stay external:
 * the host loader resolves them to its own singletons.
 */
export async function bundlePackRuntime(
  packDir: string,
  outputDir: string,
  options: BundleRuntimeOptions = {},
): Promise<{ success: boolean; error?: string }> {
  const entryPath = path.join(packDir, 'src', '__generated__', 'pack-entry.ts');
  if (!fs.existsSync(entryPath)) {
    return { success: false, error: 'No src/__generated__/pack-entry.ts. Run "abuddy generate-entries" first.' };
  }

  const esbuild = await import('esbuild');
  const runtimeDir = path.join(outputDir, 'runtime');
  fs.mkdirSync(runtimeDir, { recursive: true });

  const externals = [
    ...Object.keys(SHARED_DEPS),
    '@abuddy/sdk',
    '@abuddy/sdk/*',
  ];

  const tsconfigPath = path.join(packDir, 'tsconfig.json');
  const aliases = readTsconfigAliases(packDir);
  const subpathImports = readSubpathImports(packDir);
  const plugins: import('esbuild').Plugin[] = [stubFrontendAssetsPlugin()];
  if (Object.keys(aliases).length > 0) plugins.push(makeAliasPlugin(aliases));
  if (Object.keys(subpathImports).length > 0) plugins.push(makeSubpathPlugin(subpathImports, packDir));

  try {
    await esbuild.build({
      entryPoints: [entryPath],
      bundle: true,
      format: 'cjs',
      platform: 'node',
      target: 'node20',
      outfile: path.join(runtimeDir, 'index.cjs'),
      external: externals,
      tsconfig: fs.existsSync(tsconfigPath) ? tsconfigPath : undefined,
      plugins,
      minify: options.release ?? false,
      sourcemap: options.release ? false : true,
      logLevel: 'silent',
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Bundle the pack's build-time step definitions (manifest steps.build) into
 * dist/build/steps.build.mjs. Dependent packs' `abuddy build` imports it to validate
 * and compile flows with this pack's real step code. @abuddy/sdk and host-shared
 * packages stay external and resolve from the importing pack's node_modules.
 */
export async function bundlePackStepBuild(
  packDir: string,
  outputDir: string,
  entry: string,
  options: BundleRuntimeOptions = {},
): Promise<{ success: boolean; error?: string }> {
  const entryPath = path.resolve(packDir, entry);
  if (!fs.existsSync(entryPath)) {
    return { success: false, error: `steps.build entry not found: ${entry}` };
  }
  const esbuild = await import('esbuild');
  const tsconfigPath = path.join(packDir, 'tsconfig.json');
  const aliases = readTsconfigAliases(packDir);
  const subpathImports = readSubpathImports(packDir);
  const plugins: import('esbuild').Plugin[] = [stubFrontendAssetsPlugin()];
  if (Object.keys(aliases).length > 0) plugins.push(makeAliasPlugin(aliases));
  if (Object.keys(subpathImports).length > 0) plugins.push(makeSubpathPlugin(subpathImports, packDir));

  try {
    await esbuild.build({
      entryPoints: [entryPath],
      bundle: true,
      format: 'esm',
      platform: 'node',
      target: 'node20',
      outfile: path.join(outputDir, 'build', 'steps.build.mjs'),
      external: [...Object.keys(SHARED_DEPS), '@abuddy/sdk', '@abuddy/sdk/*'],
      tsconfig: fs.existsSync(tsconfigPath) ? tsconfigPath : undefined,
      plugins,
      minify: options.release ?? false,
      logLevel: 'silent',
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Step and plugin definitions reference Vue components and styles for the renderer.
 * The backend runtime never renders them, so they become empty modules.
 */
function stubFrontendAssetsPlugin(): import('esbuild').Plugin {
  return {
    name: 'stub-frontend-assets',
    setup(build) {
      build.onResolve({ filter: /\.(vue|css)$/ }, args => ({ path: args.path, namespace: 'frontend-stub' }));
      build.onLoad({ filter: /.*/, namespace: 'frontend-stub' }, () => ({ contents: 'module.exports = {};', loader: 'js' }));
    },
  };
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
          const resolved = resolveWithExtensions(path.resolve(target, rest));
          return resolved ? { path: resolved } : undefined;
        });
      }
    },
  };
}
