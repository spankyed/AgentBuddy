import * as fs from 'node:fs';
import * as path from 'node:path';
import { APP_ONLY_EXPORTS, HOST_RESOLVED_BINARIES, SHARED_DEPS, sharedInstanceExternals } from '@abuddy/host/build/shared-deps';
import { SEED_COMPILERS_FILE } from '@abuddy/sdk/build';
import { checkSeedRuntimeLoads } from './seed-runtime-check';
import type { RecordReads } from './build-reads';
import { errorMessage } from '@abuddy/sdk/utils/pure';

export interface BundleRuntimeOptions {
  /** Minify for release bundles; dev builds keep readable output with source maps. */
  release?: boolean;
  /**
   * Where this bundle reports the files it read, for the build's record of its inputs. Absent when
   * nothing is recording, which is what keeps `metafile` off in that case.
   */
  recordReads?: RecordReads;
}

/**
 * The host-provided packages every pack bundle leaves external; the host loader resolves its own singletons.
 *
 * Exported for `tests/build/pack-externals.spec.ts`, which holds these against what the loader actually
 * provides: an external specifier the loader does not resolve is a pack that loads in this checkout, where
 * node_modules sits above it, and fails once installed, where nothing does.
 */
export const HOST_EXTERNALS = [...Object.keys(SHARED_DEPS), ...sharedInstanceExternals()];

type EsbuildOptions = import('esbuild').BuildOptions;

/**
 * The esbuild setup every pack bundle shares: the pack's tsconfig, the host-import guard and
 * frontend-asset stub, and node/esm defaults. esbuild resolves the pack's own `#` imports itself, since
 * each names the file that is there.
 * `overrides` supplies the entry, output and per-bundle options.
 */
async function bundlePackSource<T extends EsbuildOptions>(
  packDir: string,
  options: BundleRuntimeOptions,
  overrides: T,
): Promise<import('esbuild').BuildResult<T>> {
  const esbuild = await import('esbuild');
  const tsconfigPath = path.join(packDir, 'tsconfig.json');
  const plugins: import('esbuild').Plugin[] = [rejectHostImportsPlugin(), stubFrontendAssetsPlugin()];

  const merged: EsbuildOptions = {
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    external: [...HOST_EXTERNALS, ...HOST_RESOLVED_BINARIES],
    tsconfig: fs.existsSync(tsconfigPath) ? tsconfigPath : undefined,
    plugins,
    minify: options.release ?? false,
    logLevel: 'silent',
    // `metafile.inputs` is this bundle's dep file, and the one place the five esbuild bundles share: a
    // caller asking for the record never has to remember the flag, and one that is not pays nothing
    ...(options.recordReads && { metafile: true }),
    ...overrides,
  };
  const result = await esbuild.build(merged);
  if (options.recordReads && result.metafile) {
    options.recordReads({ bundler: 'esbuild', version: esbuild.version, files: Object.keys(result.metafile.inputs) });
  }
  // esbuild keys `outputFiles`/`metafile` off the literal options it was called with; merging hides
  // the caller's `write: false` / `metafile: true` from it, so restate them on the result.
  return result as unknown as import('esbuild').BuildResult<T>;
}

function bundleError(err: unknown): { success: false; error: string } {
  return { success: false, error: errorMessage(err) };
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

