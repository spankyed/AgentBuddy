import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';
import { APP_ONLY_EXPORTS, SHARED_DEPS, sharedInstanceExternals } from '@abuddy/host/build/shared-deps';
import { SEED_COMPILERS_FILE } from '@abuddy/sdk/build';
import { checkSeedRuntimeLoads } from './seed-runtime-check';

export interface BundleRuntimeOptions {
  /** Minify for release bundles; dev builds keep readable output with source maps. */
  release?: boolean;
}

/** The host-provided packages every pack bundle leaves external; the host loader resolves its own singletons. */
const HOST_EXTERNALS = [...Object.keys(SHARED_DEPS), ...sharedInstanceExternals()];

type EsbuildOptions = import('esbuild').BuildOptions;

/**
 * The esbuild setup every pack bundle shares: the pack's tsconfig, its tsconfig path aliases and
 * package.json subpath imports, the host-import guard and frontend-asset stub, and node/esm defaults.
 * `overrides` supplies the entry, output and per-bundle options.
 */
async function bundlePackSource<T extends EsbuildOptions>(
  packDir: string,
  options: BundleRuntimeOptions,
  overrides: T,
): Promise<import('esbuild').BuildResult<T>> {
  const esbuild = await import('esbuild');
  const tsconfigPath = path.join(packDir, 'tsconfig.json');
  const aliases = readTsconfigAliases(packDir);
  const subpathImports = readSubpathImports(packDir);
  const plugins: import('esbuild').Plugin[] = [rejectHostImportsPlugin(), stubFrontendAssetsPlugin()];
  if (Object.keys(aliases).length > 0) plugins.push(makeAliasPlugin(aliases));
  if (Object.keys(subpathImports).length > 0) plugins.push(makeSubpathPlugin(subpathImports, packDir));

  const merged: EsbuildOptions = {
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    external: HOST_EXTERNALS,
    tsconfig: fs.existsSync(tsconfigPath) ? tsconfigPath : undefined,
    plugins,
    minify: options.release ?? false,
    logLevel: 'silent',
    ...overrides,
  };
  // esbuild keys `outputFiles`/`metafile` off the literal options it was called with; merging hides
  // the caller's `write: false` / `metafile: true` from it, so restate them on the result.
  return await esbuild.build(merged) as unknown as import('esbuild').BuildResult<T>;
}

function bundleError(err: unknown): { success: false; error: string } {
  return { success: false, error: err instanceof Error ? err.message : String(err) };
}

/**
 * Bundle the pack's generated backend entry (src/__generated__/pack-entry.ts) into
 * dist/runtime/index.cjs. It exports `registration` (systems, services, steps,
 * artifacts, blocks, EARS, boot hooks, migrations) and `setCompiledDir`, the same
 * contract built-in packs use. Host-provided and shared-instance packages stay external:
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

  const runtimeDir = path.join(outputDir, 'runtime');
  fs.mkdirSync(runtimeDir, { recursive: true });

  try {
    await bundlePackSource(packDir, options, {
      entryPoints: [entryPath],
      format: 'cjs',
      outfile: path.join(runtimeDir, 'index.cjs'),
      sourcemap: options.release ? false : true,
    });
    return { success: true };
  } catch (err) {
    return bundleError(err);
  }
}

/**
 * Bundle the pack's build-time step definitions (manifest steps.build) into
 * dist/build/steps.build.mjs. Dependent packs' `abuddy build` imports it to validate
 * and compile flows with this pack's real step code. Shared-instance and host-shared
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
  try {
    await bundlePackSource(packDir, options, {
      entryPoints: [entryPath],
      outfile: path.join(outputDir, 'build', 'steps.build.mjs'),
    });
    return { success: true };
  } catch (err) {
    return bundleError(err);
  }
}

/**
 * Bundle the compiler modules named in the pack's seedFormats into dist/build/seed-compilers.mjs,
 * one export per format name. Dependent packs' `abuddy build` compiles this pack's formats with it,
 * since the pack's sources aren't installed. Shared-instance and host-shared packages stay external.
 */
export async function bundlePackSeedCompilers(
  packDir: string,
  outputDir: string,
  compilers: Record<string, string>,
  options: BundleRuntimeOptions = {},
): Promise<{ success: boolean; error?: string }> {
  for (const [name, modulePath] of Object.entries(compilers)) {
    if (!fs.existsSync(path.resolve(packDir, modulePath))) {
      return { success: false, error: `seed format "${name}": compiler module not found: ${modulePath}` };
    }
  }
  const contents = Object.entries(compilers)
    .map(([name, modulePath]) => `export { default as ${JSON.stringify(name)} } from ${JSON.stringify(path.resolve(packDir, modulePath))};`)
    .join('\n');

  try {
    await bundlePackSource(packDir, options, {
      stdin: { contents, resolveDir: packDir, sourcefile: 'seed-compilers.ts', loader: 'ts' },
      outfile: path.join(outputDir, 'build', SEED_COMPILERS_FILE),
    });
    return { success: true };
  } catch (err) {
    return bundleError(err);
  }
}

/**
 * Bundle the pack's generated flow helpers (src/__generated__/flow-helpers.ts) into one ES module,
 * returned with the names it exports rather than written: the pack's snapshot carries it, and
 * dependents' generated flow helpers re-export it. Shared-instance and host-shared packages stay external.
 */
export async function bundlePackFlowHelpersModule(
  packDir: string,
  options: BundleRuntimeOptions = {},
): Promise<{ success: true; module: string; exports: string[] } | { success: false; error: string }> {
  const entryPath = path.join(packDir, 'src', '__generated__', 'flow-helpers.ts');
  if (!fs.existsSync(entryPath)) {
    return { success: false, error: 'No src/__generated__/flow-helpers.ts. Run "abuddy generate-entries" first.' };
  }
  try {
    const result = await bundlePackSource(packDir, options, {
      entryPoints: [entryPath],
      outfile: path.join(packDir, 'flow-helpers.mjs'),
      write: false,
      metafile: true,
    });
    const [output] = Object.values(result.metafile.outputs);
    return { success: true, module: result.outputFiles[0].text, exports: [...output.exports].sort() };
  } catch (err) {
    return bundleError(err);
  }
}

/** The pack's seed runtime bundle in its build dir: what dependents' unit tests register */
export const SEED_RUNTIME_FILE = 'seed-runtime.mjs';

/**
 * Bundle the pack's seed runtime (src/__generated__/seed-runtime.ts: entity types, repositories,
 * seed hooks) into dist/build/seed-runtime.mjs. Only the shared-instance packages (@abuddy/sdk and
 * @abuddy/ears) stay external, so a dependent's unit tests can load it with just their own installed
 * and share their instances. The
 * build then loads it that way, so a bundle that can't load fails here.
 */
export async function bundlePackSeedRuntime(
  packDir: string,
  outputDir: string,
  options: BundleRuntimeOptions = {},
): Promise<{ success: boolean; error?: string }> {
  const entryPath = path.join(packDir, 'src', '__generated__', 'seed-runtime.ts');
  if (!fs.existsSync(entryPath)) {
    return { success: false, error: 'No src/__generated__/seed-runtime.ts. Run "abuddy generate-entries" first.' };
  }
  const outfile = path.join(outputDir, 'build', SEED_RUNTIME_FILE);
  try {
    await bundlePackSource(packDir, options, {
      entryPoints: [entryPath],
      outfile,
      external: sharedInstanceExternals(),
      // Bundled CommonJS dependencies may call require(); give the ESM bundle one
      banner: { js: "import { createRequire as __abuddyCreateRequire } from 'node:module'; const require = __abuddyCreateRequire(import.meta.url);" },
    });
  } catch (err) {
    return bundleError(err);
  }
  return checkSeedRuntimeLoads(packDir, outfile);
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/**
 * Fails the bundle when pack code imports @abuddy/host, the app's private package, or an export only the
 * app loads (`APP_ONLY_EXPORTS`, the LMDB store): installed AgentBuddy doesn't provide them to packs, so
 * they would only fail later, at load. Packs use @abuddy/sdk.
 */
export function rejectHostImportsPlugin(): import('esbuild').Plugin {
  const appOnly = new RegExp(`^(?:${Object.keys(APP_ONLY_EXPORTS).map(escapeRegExp).join('|')})$`);
  return {
    name: 'reject-host-imports',
    setup(build) {
      const importedFrom = (importer: string) => path.relative(process.cwd(), importer) || importer;
      build.onResolve({ filter: /^@abuddy\/host(?:\/|$)/ }, (args) => ({
        errors: [{ text: `${args.path} is the app's private host package; packs import @abuddy/sdk instead (imported from ${importedFrom(args.importer)})` }],
      }));
      build.onResolve({ filter: appOnly }, (args) => ({
        errors: [{ text: `${args.path} is only for the app (${APP_ONLY_EXPORTS[args.path]}); packs can't import it (imported from ${importedFrom(args.importer)})` }],
      }));
    },
  };
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

/** A pack tsconfig's `paths` as esbuild aliases: `{ "#generated/*": "src/__generated__/*" }` → absolute dirs. */
export function readTsconfigAliases(packDir: string): Record<string, string> {
  const aliases: Record<string, string> = {};
  const tsconfigPath = path.join(packDir, 'tsconfig.json');
  if (!fs.existsSync(tsconfigPath)) return aliases;
  try {
    // TypeScript's own JSONC reader, not a regex: a `//` inside a string is the common case here
    // (`"$schema": "https://…"`), and stripping to end of line there breaks the parse, which used to
    // drop every path alias in silence.
    const { config, error } = ts.readConfigFile(tsconfigPath, file => fs.readFileSync(file, 'utf-8'));
    if (error) return aliases;
    const paths: Record<string, string[]> = config?.compilerOptions?.paths ?? {};
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
