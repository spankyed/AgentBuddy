import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import type { Plugin as VitePlugin } from 'vite';
import { sourceConditions } from '@abuddy/sdk/build';
import { getSharedFeDeps, getSdkFeModules, getUiFeModules } from '@abuddy/host/build/shared-deps';

const EXTERNAL_PREFIX = '\0pack-external:';

function parseNamedExports(source: string): string[] {
  const exports: string[] = [];
  const cleaned = source.replace(/export\s+type\s*\{[^}]*\}/g, '');

  for (const match of cleaned.matchAll(/export\s*\{([^}]+)\}/g)) {
    for (const item of match[1].split(',')) {
      const trimmed = item.trim();
      if (!trimmed || trimmed.startsWith('type ')) continue;
      const asMatch = trimmed.match(/\w+\s+as\s+(\w+)/);
      const name = asMatch ? asMatch[1] : trimmed.split(/\s/)[0];
      if (name !== 'default') exports.push(name);
    }
  }

  for (const match of cleaned.matchAll(/export\s+(?:async\s+)?(?:const|let|var|function|class)\s+(\w+)/g)) {
    exports.push(match[1]);
  }

  return [...new Set(exports)];
}

function generateGlobalProxy(globalKey: string, namedExports: string[]): string {
  const lines = [`const __m = window.__abuddy[${JSON.stringify(globalKey)}];`];
  for (const name of namedExports) {
    lines.push(`export const ${name} = __m.${name};`);
  }
  lines.push(`export default __m.default;`);
  return lines.join('\n');
}

/** Whether the pack's abuddy.json opts into bundling its own copy of @abuddy/ui (`fe.bundleUi`). */
function bundlesUi(packDir: string): boolean {
  try {
    return JSON.parse(fs.readFileSync(path.join(packDir, 'abuddy.json'), 'utf-8')).fe?.bundleUi === true;
  } catch {
    return false;
  }
}

export function packExternalsPlugin(packDir: string): VitePlugin {
  const feDeps = getSharedFeDeps();
  const sdkModules = getSdkFeModules();
  // @abuddy/ui comes from the host like the SDK modules, unless the pack bundles all of it
  const uiModules = bundlesUi(packDir) ? {} : getUiFeModules(packDir);

  function discoverRuntimeExports(specifier: string): string[] {
    for (const base of [path.join(packDir, 'package.json'), import.meta.url]) {
      try {
        const req = createRequire(base);
        const mod = req(specifier);
        return Object.keys(mod).filter(
          k => k !== 'default' && k !== '__esModule' && /^[a-zA-Z_$]/.test(k),
        );
      } catch {}
    }
    return [];
  }

  // SDK modules resolve through Vite (this.resolve), so the build's conditions apply: a pack
  // linked to a checkout's workspace SDK gets its source, an installed SDK its dist.
  const packImporter = path.join(packDir, 'package.json');
  type ResolveContext = { resolve: (source: string, importer?: string, options?: { skipSelf?: boolean }) => Promise<{ id: string; external?: boolean | string } | null> };
  async function resolveSdkFile(ctx: ResolveContext, specifier: string): Promise<string | undefined> {
    const resolved = await ctx.resolve(specifier, packImporter, { skipSelf: true });
    const file = resolved && !resolved.external ? resolved.id.split('?')[0] : undefined;
    return file && fs.existsSync(file) ? fs.realpathSync(file) : undefined;
  }

  async function discoverSourceExports(ctx: ResolveContext, specifier: string): Promise<string[]> {
    const sourcePath = await resolveSdkFile(ctx, specifier);
    return sourcePath ? parseNamedExports(fs.readFileSync(sourcePath, 'utf-8')) : [];
  }

  // The SDK's host-module registry. Proxied SDK modules share the host's copy via
  // window.__abuddy; an inlined copy has its own empty registry, so any inlined
  // module calling getHostModule() throws "SDK host module ... not registered".
  async function resolveHostRegistryPath(ctx: ResolveContext): Promise<string | undefined> {
    const runtimeIndex = await resolveSdkFile(ctx, '@abuddy/sdk/runtime');
    if (!runtimeIndex) return undefined;
    // Workspace source, or the published package's compiled module
    const host = ['host.ts', 'host.js'].map(f => path.join(path.dirname(runtimeIndex), f)).find(f => fs.existsSync(f));
    return host && fs.realpathSync(host);
  }

  // SDK modules the host shares, by file. A bundled SDK module can import one of these barrels
  // by relative path (e.g. '../designations/index.js'); that import must get the host proxy too,
  // not an inlined copy.
  let sharedModuleFiles: Promise<{ sdkRoot: string; bySpecifier: Map<string, string> } | null> | undefined;
  function getSharedModuleFiles(ctx: ResolveContext) {
    sharedModuleFiles ??= (async () => {
      const manifest = await resolveSdkFile(ctx, '@abuddy/sdk/package.json');
      if (!manifest) return null;
      const bySpecifier = new Map<string, string>();
      for (const specifier of Object.keys(sdkModules)) {
        const file = await resolveSdkFile(ctx, specifier);
        if (file) bySpecifier.set(file, specifier);
      }
      return { sdkRoot: path.dirname(manifest), bySpecifier };
    })();
    return sharedModuleFiles;
  }

  return {
    name: 'pack-externals',
    enforce: 'pre',

    async generateBundle(_options, bundle) {
      const hostPath = await resolveHostRegistryPath(this);
      if (!hostPath) return;
      const sdkRoot = path.dirname(path.dirname(hostPath));
      // Only code that survives tree-shaking matters (e.g. generated files re-export BE modules)
      const rendered = Object.values(bundle).some(
        (out) => out.type === 'chunk' && (out.modules[hostPath]?.renderedLength ?? 0) > 0,
      );
      if (!rendered) return;
      const hostId = hostPath;

      // Walk importers back to the first pack-owned module to name the offending import
      const chain = [hostId];
      const seen = new Set(chain);
      let current = hostId;
      while (current.startsWith(sdkRoot)) {
        const next = this.getModuleInfo(current)?.importers.find(i => !seen.has(i));
        if (!next) break;
        chain.push(next);
        seen.add(next);
        current = next;
      }
      const packRoot = fs.realpathSync(packDir);
      const rel = (id: string) => id.startsWith(sdkRoot)
        ? `@abuddy/sdk/${path.relative(sdkRoot, id)}`
        : path.relative(packRoot, id);

      this.error(
        'Pack FE code inlines an @abuddy/sdk module that depends on the host module registry, ' +
        'which would fail at runtime with "SDK host module ... not registered".\n' +
        `  Import chain: ${chain.reverse().map(rel).join(' → ')}\n` +
        `  Only these SDK modules are shared with the host in the renderer: ${Object.keys(sdkModules).join(', ')}.\n` +
        '  Import from one of those instead, or add the module to SDK_FE_MODULES in @abuddy/host/build/shared-deps.',
      );
    },

    async resolveId(source, importer, options) {
      const shared = source.startsWith('.') && importer ? await getSharedModuleFiles(this) : null;
      if (shared) {
        const importerPath = importer!.split('?')[0];
        const insideSdk = fs.existsSync(importerPath) && fs.realpathSync(importerPath).startsWith(shared.sdkRoot + path.sep);
        if (insideSdk) {
          const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
          const file = resolved && !resolved.external ? resolved.id.split('?')[0] : undefined;
          const specifier = file && fs.existsSync(file) ? shared.bySpecifier.get(fs.realpathSync(file)) : undefined;
          if (specifier) return EXTERNAL_PREFIX + specifier;
        }
      }
      if (feDeps[source]) {
        return EXTERNAL_PREFIX + source;
      }
      if (sdkModules[source] || uiModules[source]) {
        return EXTERNAL_PREFIX + source;
      }
      if (source.startsWith('@abuddy/sdk')) {
        // From the pack, not the importing module: SDK modules must resolve to the pack's SDK
        return this.resolve(source, packImporter, { ...options, skipSelf: true });
      }
    },

    async load(id) {
      if (!id.startsWith(EXTERNAL_PREFIX)) return;
      const specifier = id.slice(EXTERNAL_PREFIX.length);

      const hostDep = feDeps[specifier];
      if (hostDep) {
        return generateGlobalProxy(hostDep.globalKey, discoverRuntimeExports(specifier));
      }

      const sharedMod = sdkModules[specifier] ?? uiModules[specifier];
      if (sharedMod) {
        return generateGlobalProxy(sharedMod.globalKey, await discoverSourceExports(this, specifier));
      }
    },
  };
}

export interface BundleFEOptions {
  packDir: string;
  outputDir: string;
  entryPoint: string;
  /** Minified, no source maps (release bundles). */
  release?: boolean;
}

export function findFEEntry(packDir: string): string | null {
  const srcEntry = path.join(packDir, 'src', 'pack-entry-fe.ts');
  if (fs.existsSync(srcEntry)) return srcEntry;

  const srcEntryJs = path.join(packDir, 'src', 'pack-entry-fe.js');
  if (fs.existsSync(srcEntryJs)) return srcEntryJs;

  const generatedEntry = path.join(packDir, 'src', '__generated__', 'pack-entry-fe.ts');
  if (fs.existsSync(generatedEntry)) return generatedEntry;

  return null;
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

export async function bundlePackFE(options: BundleFEOptions): Promise<{ success: boolean; error?: string }> {
  const { packDir, outputDir, entryPoint, release = false } = options;

  const vite = await import('vite');
  const vue = (await import('@vitejs/plugin-vue')).default;

  const tsconfigAliases = readTsconfigAliases(packDir);
  const aliasEntries = Object.entries(tsconfigAliases).map(([find, replacement]) => ({ find, replacement }));

  // Tailwind CSS: use pack's own config if present, otherwise generate one
  let postcssPlugins: any[] = [];
  try {
    const tailwindcss = (await import('tailwindcss')).default;
    const autoprefixer = (await import('autoprefixer')).default;
    const packTwConfig = path.join(packDir, 'tailwind.config.ts');
    const packTwConfigJs = path.join(packDir, 'tailwind.config.js');
    const twConfig = fs.existsSync(packTwConfig) ? packTwConfig
      : fs.existsSync(packTwConfigJs) ? packTwConfigJs
      : {
        content: [path.join(packDir, 'src/**/*.{vue,js,ts,jsx,tsx}')],
      };
    postcssPlugins = [tailwindcss(twConfig), autoprefixer()];
  } catch {}

  // Inject @tailwind utilities so Tailwind generates classes found in templates
  const tailwindInjectPlugin: VitePlugin = {
    name: 'tailwind-inject',
    resolveId(id) { if (id === 'virtual:tailwind-utils.css') return '\0virtual:tailwind-utils.css'; },
    load(id) { if (id === '\0virtual:tailwind-utils.css') return '@tailwind utilities;'; },
    transform(code, id) {
      if (id === entryPoint || id === path.resolve(packDir, entryPoint)) {
        return `import 'virtual:tailwind-utils.css';\n${code}`;
      }
    },
  };

  try {
    await vite.build({
      root: packDir,
      configFile: false,
      plugins: [
        tailwindInjectPlugin,
        packExternalsPlugin(packDir),
        vue(),
      ],
      css: {
        postcss: { plugins: postcssPlugins },
      },
      resolve: {
        alias: aliasEntries,
        conditions: [...sourceConditions(packDir), ...vite.defaultClientConditions],
      },
      build: {
        lib: {
          entry: entryPoint,
          formats: ['es'],
          fileName: 'fe',
        },
        outDir: outputDir,
        emptyOutDir: false,
        sourcemap: !release,
        minify: release,
        target: 'es2022',
        cssCodeSplit: false,
        rollupOptions: {
          treeshake: { propertyReadSideEffects: false },
        },
      },
      logLevel: 'warn',
    });
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
