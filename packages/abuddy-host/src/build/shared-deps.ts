import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';

/**
 * Packages a process must load once: pack runtimes, dependency runtimes, the app and tests share one
 * instance of each (the SDK's registries, the EARS engine's data). Every bundler external list, the
 * host pack loader's bridge, the pack test harness's bridge and bundle-package derive from this list.
 * The frontend shares only the SDK modules below (SDK_FE_MODULES): it keeps no EARS data, so a pack
 * frontend inlines what it imports from @abuddy/ears (constants and pure helpers).
 */
export const SHARED_INSTANCE_PACKAGES = ['@abuddy/sdk', '@abuddy/ears'] as const;

/** The shared-instance package a specifier belongs to (`@abuddy/sdk/repositories` → `@abuddy/sdk`), if any */
export function sharedInstancePackage(specifier: string): string | undefined {
  return SHARED_INSTANCE_PACKAGES.find((pkg) => specifier === pkg || specifier.startsWith(`${pkg}/`));
}

/** esbuild externals for the shared-instance packages and all their subpaths */
export function sharedInstanceExternals(): string[] {
  return SHARED_INSTANCE_PACKAGES.flatMap((pkg) => [pkg, `${pkg}/*`]);
}

/**
 * Shared-instance exports only the app's composition root loads, with the reason. Pack code never
 * requires them, so neither the pack loader's bridge nor the test harness's provides them.
 */
export const APP_ONLY_EXPORTS: Readonly<Record<string, string>> = {
  '@abuddy/ears/lmdb': "the app's LMDB store; it loads lmdb, which only the app installs",
};

/**
 * The specifiers of a shared-instance package that backend code can require, read from its exports
 * map: every code export except the frontend's (`./fe`, `./fe/*`), metadata (`.json`), wildcards,
 * `APP_ONLY_EXPORTS` and exports only the monorepo resolves (an `@abuddy/source` target without a published one).
 */
export function sharedInstanceSpecifiers(pkg: string, exportsMap: Record<string, unknown>): string[] {
  const specifier = (key: string) => (key === '.' ? pkg : `${pkg}/${key.slice(2)}`);
  return Object.entries(exportsMap)
    .filter(([key, target]) =>
      !key.includes('*')
      && !Object.hasOwn(APP_ONLY_EXPORTS, specifier(key))
      && !key.endsWith('.json')
      && key !== './fe' && !key.startsWith('./fe/')
      && !(typeof target === 'object' && target !== null && Object.keys(target).every((condition) => condition === '@abuddy/source')))
    .map(([key]) => specifier(key));
}

/**
 * The exports map of a shared-instance package as `fromFile` (a path or file URL) resolves it. A pack
 * that doesn't depend on one directly gets the copy its @abuddy/sdk resolves.
 */
export function sharedInstanceExports(pkg: string, fromFile: string): Record<string, unknown> {
  const require = createRequire(fromFile);
  let manifest: string;
  try {
    manifest = require.resolve(`${pkg}/package.json`);
  } catch (err) {
    if (pkg === SHARED_INSTANCE_PACKAGES[0]) throw err;
    const sdkManifest = fs.realpathSync(require.resolve(`${SHARED_INSTANCE_PACKAGES[0]}/package.json`));
    manifest = createRequire(sdkManifest).resolve(`${pkg}/package.json`);
  }
  return (JSON.parse(fs.readFileSync(manifest, 'utf-8')) as { exports: Record<string, unknown> }).exports;
}

export interface SharedDep {
  globalKey?: string;
  target: 'fe' | 'be' | 'both';
}

export const SHARED_DEPS: Record<string, SharedDep> = {
  'vue':                  { globalKey: 'vue',              target: 'fe' },
  'xstate':               { globalKey: 'xstate',           target: 'both' },
  '@xstate/vue':          { globalKey: 'xstateVue',        target: 'fe' },
  'zod':                  {                                target: 'be' },

  '@tiptap/core':         { globalKey: 'tiptapCore',       target: 'fe' },
  '@tiptap/vue-3':        { globalKey: 'tiptapVue3',       target: 'fe' },
  '@tiptap/starter-kit':  { globalKey: 'tiptapStarterKit', target: 'fe' },
  'reka-ui':              { globalKey: 'rekaUi',           target: 'fe' },
  'lucide-vue-next':      { globalKey: 'lucideVueNext',    target: 'fe' },
  '@vue-flow/core':       { globalKey: 'vueFlowCore',      target: 'fe' },
};

/**
 * Packages the host shares with every subpath they export, keyed by specifier. A pack that bundles
 * @abuddy/ui (fe.bundleUi) imports ProseMirror and tiptap's Vue menus through these; sharing them
 * keeps one ProseMirror in the app, the host's.
 */
const SHARED_SUBPATH_PACKAGES = ['@tiptap/pm', '@tiptap/vue-3'];

/** Exported code subpaths of an installed package (`@tiptap/pm/state`, …) */
function exportedSubpaths(name: string): string[] {
  const require = createRequire(import.meta.url);
  const manifestPath = (require.resolve.paths(name) ?? [])
    .map((dir) => path.join(dir, name, 'package.json'))
    .find((file) => fs.existsSync(file));
  if (!manifestPath) return [];
  const exports: Record<string, unknown> = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')).exports ?? {};
  return Object.keys(exports)
    .filter((key) => key.startsWith('./') && !key.endsWith('.json') && !key.includes('*'))
    .map((key) => `${name}${key.slice(1)}`);
}

export function getSharedFeDeps(): Record<string, SharedDep & { globalKey: string }> {
  const deps = Object.fromEntries(
    Object.entries(SHARED_DEPS).filter(([, d]) => d.target !== 'be' && d.globalKey),
  ) as Record<string, SharedDep & { globalKey: string }>;
  for (const specifier of SHARED_SUBPATH_PACKAGES.flatMap(exportedSubpaths)) {
    deps[specifier] ??= { globalKey: specifier, target: 'fe' };
    // @tiptap/pm/<name> is `export * from 'prosemirror-<name>'`: libraries importing ProseMirror
    // directly (tiptap-markdown → prosemirror-markdown) get the same module
    const pmModule = specifier.match(/^@tiptap\/pm\/(.+)$/)?.[1];
    if (pmModule) deps[`prosemirror-${pmModule}`] ??= { globalKey: specifier, target: 'fe' };
  }
  return deps;
}

export interface SdkFeModule {
  globalKey: string;
}

export const SDK_FE_MODULES: Record<string, SdkFeModule> = {
  '@abuddy/sdk/fe':           { globalKey: 'sdkFe' },
  '@abuddy/sdk/runtime':      { globalKey: 'sdkRuntime' },
  '@abuddy/sdk/steps':        { globalKey: 'sdkSteps' },
  '@abuddy/sdk/artifacts':    { globalKey: 'sdkArtifacts' },
  '@abuddy/sdk/blocks':       { globalKey: 'sdkBlocks' },
  '@abuddy/sdk/designations': { globalKey: 'sdkDesignations' },
  '@abuddy/sdk/events':       { globalKey: 'sdkEvents' },
  '@abuddy/sdk/helpers':      { globalKey: 'sdkHelpers' },
};

export function getSdkFeModules(): Record<string, SdkFeModule> {
  return SDK_FE_MODULES;
}

/**
 * Every @abuddy/ui export, shared with pack FE code like the SDK modules: the host exposes each
 * module on window.__abuddy under its specifier. Read from the exports map of the @abuddy/ui that
 * `fromDir` resolves (the host's own, or a pack's).
 */
export function getUiFeModules(fromDir: string): Record<string, SdkFeModule> {
  let manifestPath: string;
  try {
    manifestPath = createRequire(path.join(fromDir, 'package.json')).resolve('@abuddy/ui/package.json');
  } catch {
    return {};
  }
  const { exports } = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as { exports: Record<string, unknown> };
  return Object.fromEntries(
    Object.keys(exports)
      .filter((key) => key !== './package.json')
      .map((key) => {
        const specifier = `@abuddy/ui${key.slice(1)}`;
        return [specifier, { globalKey: specifier }];
      }),
  );
}

/**
 * The packages the host provides to pack backends, with every subpath they export: a pack bundle leaves the whole
 * package external (esbuild), so a dependency it bundles may require a subpath (the AI SDK requires `zod/v4`)
 */
export function getSharedBeDeps(): string[] {
  return Object.keys(SHARED_DEPS)
    .filter((name) => SHARED_DEPS[name].target !== 'fe')
    .flatMap((name) => [name, ...exportedSubpaths(name)]);
}

export function findSdkVersion(startDir: string): string | undefined {
  let dir = startDir;
  while (dir !== path.dirname(dir)) {
    const pkgPath = path.join(dir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        if (pkg.name === '@abuddy/sdk') return pkg.version;
      } catch {}
    }
    dir = path.dirname(dir);
  }
  return undefined;
}
