import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import type { Plugin as VitePlugin, Rollup } from 'vite';
import { init as initModuleLexer, parse as parseModule } from 'es-module-lexer';
import { getSharedFeDeps, unresolvedSubpathPackages, getSdkFeModules, getUiFeModules, sharedInstancePackage } from '@abuddy/host/build/shared-deps';
import { errorMessage } from '@abuddy/sdk/utils/pure';

const EXTERNAL_PREFIX = '\0pack-external:';

/**
 * A module that re-exports a host global. The host may be older than the pack's @abuddy/* packages:
 * a missing module fails with a message naming the fix, and a missing @abuddy/* export warns once.
 * (Third-party globals are discovered from their Node build, whose names can differ.)
 */
function generateGlobalProxy(specifier: string, globalKey: string, namedExports: string[], { warnMissing = true } = {}): string {
  const hint = "update AgentBuddy or check the pack's hostVersion";
  const lines = [
    `const __m = window.__abuddy?.[${JSON.stringify(globalKey)}];`,
    `if (!__m) throw new Error(${JSON.stringify(`${specifier} isn't provided by this AgentBuddy; ${hint}`)});`,
  ];
  if (warnMissing && namedExports.length > 0) {
    lines.push(
      `for (const __name of ${JSON.stringify(namedExports)}) {`,
      `  if (!(__name in __m)) console.warn(\`${specifier} in this AgentBuddy has no export "\${__name}"; ${hint}\`);`,
      '}',
    );
  }
  for (const name of namedExports) {
    lines.push(`export const ${name} = __m.${name};`);
  }
  lines.push(`export default __m.default;`);
  return lines.join('\n');
}

/**
 * Whether the pack's abuddy.json opts into bundling its own copy of @abuddy/ui (`fe.bundleUi`).
 * No manifest is fine — `bundleUi` is opt-in, and only a pack directory has one. A manifest that is
 * there but unreadable is not: it may be the one that opts in, and reading it as "no" would quietly
 * proxy @abuddy/ui to the host and skip its Tailwind classes.
 */
function bundlesUi(packDir: string): boolean {
  const manifestPath = path.join(packDir, 'abuddy.json');
  if (!fs.existsSync(manifestPath)) return false;
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf-8')).fe?.bundleUi === true;
  } catch (err) {
    throw new Error(`Couldn't read ${manifestPath}, so the FE build can't tell whether this pack bundles @abuddy/ui (fe.bundleUi): ${errorMessage(err)}`);
  }
}

/**
 * Tailwind content globs for the @abuddy/ui a pack bundles: its build, which is what a pack resolves.
 * Only reached for a pack that set `fe.bundleUi`, so anything that leaves Tailwind nothing to read is a
 * build failure — its components are nothing but Tailwind classes, and empty globs would bundle every
 * one of them unstyled, with no error. An unresolvable package and a package whose build is missing are
 * the same fault to the pack author: what they get is an unstyled app.
 */
/** Whether any file under `dir`, at any depth, has this extension */
function hasFile(dir: string, ext: string): boolean {
  return fs.readdirSync(dir, { withFileTypes: true }).some((entry) => (entry.isDirectory()
    ? hasFile(path.join(dir, entry.name), ext)
    : entry.name.endsWith(ext)));
}

function uiTailwindContent(packDir: string): string[] {
  let uiDir: string;
  try {
    uiDir = path.dirname(fs.realpathSync(createRequire(path.join(packDir, 'package.json')).resolve('@abuddy/ui/package.json')));
  } catch (err) {
    throw new Error(
      `This pack sets fe.bundleUi, but @abuddy/ui can't be resolved from ${packDir}, so Tailwind would generate none of its components' classes: ${errorMessage(err)}`,
    );
  }
  const built = path.join(uiDir, 'dist');
  const content = path.join(built, '**/*.js');
  // Tailwind reads class names out of the built modules and silently generates nothing when it finds no
  // file to read — so check for what the glob actually matches, not merely that the directory is non-empty
  if (!fs.existsSync(built) || !hasFile(built, '.js')) {
    throw new Error(
      `This pack sets fe.bundleUi, but @abuddy/ui has no built modules at ${content}, so Tailwind would generate none of its components' classes. Build the packages first: npm run packages:ensure`,
    );
  }
  return [content];
}

/** A pack's @abuddy/ui, which is what depends on tiptap and may hold its own nested copy */
function uiPackageDir(packDir: string): string | undefined {
  try {
    return path.dirname(fs.realpathSync(createRequire(path.join(packDir, 'package.json')).resolve('@abuddy/ui/package.json')));
  } catch {
    return undefined;
  }
}

export function packExternalsPlugin(packDir: string): VitePlugin {
  const resolveFrom = [packDir, uiPackageDir(packDir)].filter((dir): dir is string => dir !== undefined);
  const feDeps = getSharedFeDeps(...resolveFrom);
  // A bundleUi pack imports ProseMirror and tiptap's Vue menus through the shared subpaths. If they
  // resolve to nothing the pack inlines its own copy and the app ends up with two ProseMirror
  // instances, which fails at runtime in ways that do not point here — so fail now, naming them.
  if (bundlesUi(packDir)) {
    const unresolved = unresolvedSubpathPackages(...resolveFrom);
    if (unresolved.length > 0) {
      throw new Error(
        `This pack sets fe.bundleUi, but ${unresolved.join(' and ')} cannot be resolved from ${packDir}, so the pack would bundle its own ProseMirror instead of sharing the app's. Install ${unresolved.length > 1 ? 'them' : 'it'} in the pack.`,
      );
    }
  }
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
      } catch {
        // Absent is fine: the host shares more FE deps than any one pack installs, and the next
        // base may have it. Coming up empty is fine too — the proxy still re-exports `default`, and
        // a named import the pack actually uses fails the build at that import, naming the module.
      }
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

  /**
   * Named exports of a module as the build compiles it (SFCs through the Vue plugin, TypeScript
   * through esbuild), following `export * from` re-exports.
   */
  async function discoverModuleExports(ctx: Rollup.PluginContext, id: string, seen = new Set<string>()): Promise<string[]> {
    if (seen.has(id)) return [];
    seen.add(id);
    const { code } = await ctx.load({ id });
    if (code === null) return [];
    await initModuleLexer;
    const [imports, exports] = parseModule(code, id);
    const names = exports.map((e) => e.n).filter((n) => n !== 'default');
    for (const imp of imports) {
      if (!imp.n || !/^export\s*\*\s*from\b/.test(code.slice(imp.ss, imp.se))) continue;
      const resolved = await ctx.resolve(imp.n, id, { skipSelf: true });
      if (resolved && !resolved.external) names.push(...await discoverModuleExports(ctx, resolved.id, seen));
    }
    return [...new Set(names)];
  }

  async function discoverSharedExports(ctx: Rollup.PluginContext, specifier: string): Promise<string[]> {
    const resolved = await ctx.resolve(specifier, packImporter, { skipSelf: true });
    return resolved && !resolved.external ? discoverModuleExports(ctx, resolved.id) : [];
  }

  // The SDK's host bindings (bindHost, bindFeHost). Proxied SDK modules share the host's copy via
  // window.__abuddy; an inlined copy has nothing bound, so any inlined module reaching the app
  // throws "No host is bound".
  async function resolveHostBindingPaths(ctx: ResolveContext): Promise<string[]> {
    const runtimeIndex = await resolveSdkFile(ctx, '@abuddy/sdk/runtime');
    if (!runtimeIndex) return [];
    // Workspace source, or the published package's compiled modules
    return ['host-runtime', 'fe-host'].flatMap((name) => {
      const file = ['ts', 'js'].map(ext => path.join(path.dirname(runtimeIndex), `${name}.${ext}`)).find(f => fs.existsSync(f));
      return file ? [fs.realpathSync(file)] : [];
    });
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
      // Only code that survives tree-shaking matters (e.g. generated files re-export BE modules)
      const hostId = (await resolveHostBindingPaths(this)).find((file) => Object.values(bundle).some(
        (out) => out.type === 'chunk' && (out.modules[file]?.renderedLength ?? 0) > 0,
      ));
      if (!hostId) return;
      const sdkRoot = path.dirname(path.dirname(hostId));

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
        'Pack FE code inlines an @abuddy/sdk module that reaches the app through its host binding, ' +
        'which would fail at runtime with "No host is bound".\n' +
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
      // A pack without @abuddy/ui installed gets an empty proxy list, which is right until it imports
      // one: the import would be bundled instead of taken from the host, and every component in it
      // would fail at load with no sign of why. A pack that means to carry its own sets fe.bundleUi.
      if (!bundlesUi(packDir) && /^@abuddy\/ui(\/|$)/.test(source)) {
        throw new Error(
          `This pack imports ${source}, but @abuddy/ui can't be resolved from ${packDir}, so there is nothing to take from the host. Install @abuddy/ui in the pack, or set fe.bundleUi to carry your own copy.`,
        );
      }
      if (sharedInstancePackage(source)) {
        // From the pack, not the importing module: shared-instance modules (@abuddy/sdk, @abuddy/ears)
        // must resolve to the pack's copies
        return this.resolve(source, packImporter, { ...options, skipSelf: true });
      }
    },

    async load(id) {
      if (!id.startsWith(EXTERNAL_PREFIX)) return;
      const specifier = id.slice(EXTERNAL_PREFIX.length);

      const hostDep = feDeps[specifier];
      if (hostDep) {
        return generateGlobalProxy(specifier, hostDep.globalKey, discoverRuntimeExports(specifier), { warnMissing: false });
      }

      const sharedMod = sdkModules[specifier] ?? uiModules[specifier];
      if (sharedMod) {
        return generateGlobalProxy(specifier, sharedMod.globalKey, await discoverSharedExports(this, specifier));
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
  let aliases: Record<string, string> = {};
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
  } catch (err) {
    // The file is there, so this is a real problem: every `compilerOptions.paths` alias is lost and
    // the imports using one fail later as "can't resolve", pointing nowhere near the cause. Not a
    // hard failure — a pack with no aliases still builds — but never silent.
    aliases = {};
    console.warn(`! FE bundle: couldn't read ${tsconfigPath}, so its compilerOptions.paths aliases are ignored: ${errorMessage(err)}`);
  }
  return aliases;
}

/**
 * PostCSS plugins for the pack's CSS: Tailwind over the pack's own config if it has one, otherwise
 * over a generated one covering `src/`. A pack that bundles @abuddy/ui also generates the classes
 * its components use.
 *
 * Nothing here fails quietly. The bundle it produces either has the pack's styles or it doesn't, and
 * an unstyled bundle with no message is the worst outcome — it looks like a successful build and the
 * cause is invisible at runtime. So:
 *
 * - **Hard failure** when the pack demonstrably relies on Tailwind: it ships a `tailwind.config`, or
 *   it sets `fe.bundleUi` (every @abuddy/ui component is Tailwind classes, so without Tailwind that
 *   bundle is *guaranteed* unstyled). A broken or unexpected config is always a hard failure — the
 *   pack wrote it, and reverting to the generated default would silently drop its theme.
 * - **Warning** when the pack gives no such signal and Tailwind can't load: it may use no Tailwind
 *   classes at all, and a toolchain problem shouldn't stop it building. The reason is still printed,
 *   together with what the bundle is missing.
 */
/**
 * @abuddy/ui's Tailwind preset, resolved from the pack, or none when its copy is too old to ship one.
 *
 * A pack building against an older @abuddy/ui has no `./tailwind-preset` export. That is not worth
 * failing the build over — it is the behaviour every such pack already had — so it degrades to the
 * warning below and the pack can still ship.
 */
async function uiTailwindPresets(packDir: string): Promise<unknown[]> {
  const require = createRequire(path.join(packDir, 'package.json'));
  let resolved: string;
  try {
    resolved = require.resolve('@abuddy/ui/tailwind-preset');
  } catch {
    console.warn("! FE bundle: this @abuddy/ui has no tailwind-preset export, so @abuddy/ui's own theme (primary-*) gets no CSS. Upgrade @abuddy/ui, or define those colours in this pack's tailwind config.");
    return [];
  }
  const mod = await import(pathToFileURL(resolved).href) as { uiTailwindPreset?: unknown; default?: unknown };
  const preset = mod.uiTailwindPreset ?? mod.default;
  return preset ? [preset] : [];
}

async function tailwindPostcssPlugins(packDir: string): Promise<any[]> {
  const packTwConfig = [path.join(packDir, 'tailwind.config.ts'), path.join(packDir, 'tailwind.config.js')]
    .find((f) => fs.existsSync(f));
  const bundleUi = bundlesUi(packDir);
  // Why a failure to load Tailwind can't be shrugged off for this pack, if it can't
  const needsTailwind = packTwConfig
    ? `This pack has ${path.basename(packTwConfig)}`
    : bundleUi
      ? 'This pack sets fe.bundleUi, so it bundles @abuddy/ui, whose components are Tailwind classes'
      : undefined;

  let tailwindcss: (config: unknown) => unknown;
  let autoprefixer: () => unknown;
  try {
    tailwindcss = (await import('tailwindcss')).default as unknown as (config: unknown) => unknown;
    autoprefixer = (await import('autoprefixer')).default as unknown as () => unknown;
  } catch (err) {
    const reason = `Tailwind CSS couldn't be loaded: ${errorMessage(err)}`;
    if (needsTailwind) {
      throw new Error(`${reason}\n  ${needsTailwind}, so the bundle would have no styles at all. Install tailwindcss and autoprefixer.`);
    }
    console.warn(`! FE bundle: ${reason}\n  The bundle is built without Tailwind, so any Tailwind classes in this pack's templates get no styles.`);
    return [];
  }

  const uiContent = bundleUi ? uiTailwindContent(packDir) : [];
  // Scanning @abuddy/ui's files finds the class names; the theme behind them (primary-*) is defined
  // only in a Tailwind config, so without its preset those classes match nothing and Tailwind emits
  // no CSS for them — the component renders with its accent silently missing.
  const uiPresets = bundleUi ? await uiTailwindPresets(packDir) : [];
  let twConfig: unknown = {
    content: [path.join(packDir, 'src/**/*.{vue,js,ts,jsx,tsx}'), ...uiContent],
    ...(uiPresets.length > 0 && { presets: uiPresets }),
  };
  if (packTwConfig) {
    // Tailwind loads a config path itself; only a pack that also needs @abuddy/ui's globs merged in
    // has to be loaded here
    twConfig = packTwConfig;
    if (uiContent.length > 0) {
      const loadConfig = (await import('tailwindcss/loadConfig.js')).default;
      let config: { content?: unknown };
      try {
        config = loadConfig(packTwConfig) as { content?: unknown };
      } catch (err) {
        throw new Error(`${path.basename(packTwConfig)} couldn't be loaded, and fe.bundleUi needs @abuddy/ui's files added to its \`content\`: ${errorMessage(err)}`);
      }
      const content = Array.isArray(config.content) ? { files: config.content } : config.content as { files?: unknown } | undefined;
      if (!content || !Array.isArray(content.files)) {
        throw new Error(
          `${path.basename(packTwConfig)} must set \`content\` to an array of globs or to { files: [...] }, so that fe.bundleUi can add @abuddy/ui's files to it; got ${JSON.stringify(config.content)}`,
        );
      }
      // The pack's own presets stay first, so it can still override the theme it inherits
      const presets = Array.isArray((config as { presets?: unknown[] }).presets) ? (config as { presets: unknown[] }).presets : [];
      twConfig = {
        ...config,
        content: { ...content, files: [...content.files, ...uiContent] },
        ...(uiPresets.length > 0 && { presets: [...uiPresets, ...presets] }),
      };
    }
  }
  return [tailwindcss(twConfig), autoprefixer()];
}

export async function bundlePackFE(options: BundleFEOptions): Promise<{ success: boolean; error?: string }> {
  const { packDir, outputDir, entryPoint, release = false } = options;

  const vite = await import('vite');
  const vue = (await import('@vitejs/plugin-vue')).default;

  const tsconfigAliases = readTsconfigAliases(packDir);
  const aliasEntries = Object.entries(tsconfigAliases).map(([find, replacement]) => ({ find, replacement }));

  let postcssPlugins: any[];
  try {
    postcssPlugins = await tailwindPostcssPlugins(packDir);
  } catch (err) {
    return { success: false, error: errorMessage(err) };
  }

  // Inject @tailwind utilities so Tailwind generates classes found in templates. Vite's module ids
  // are real paths (a pack under a symlinked dir, like macOS's /var, has others)
  const entryFile = fs.realpathSync(path.resolve(packDir, entryPoint));
  const tailwindInjectPlugin: VitePlugin = {
    name: 'tailwind-inject',
    resolveId(id) { if (id === 'virtual:tailwind-utils.css') return '\0virtual:tailwind-utils.css'; },
    load(id) { if (id === '\0virtual:tailwind-utils.css') return '@tailwind utilities;'; },
    transform(code, id) {
      if (id === entryFile || id === entryPoint || id === path.resolve(packDir, entryPoint)) {
        return `import 'virtual:tailwind-utils.css';\n${code}`;
      }
    },
  };

  try {
    await vite.build({
      root: packDir,
      configFile: false,
      plugins: [
        {
          // The app's private host package isn't provided to packs; they import @abuddy/sdk
          name: 'reject-host-imports',
          enforce: 'pre',
          resolveId(id: string, importer?: string) {
            if (/^@abuddy\/host(?:\/|$)/.test(id)) {
              this.error(`${id} is the app's private host package; packs import @abuddy/sdk instead${importer ? ` (imported from ${importer})` : ''}`);
            }
            return null;
          },
        },
        tailwindInjectPlugin,
        packExternalsPlugin(packDir),
        vue(),
      ],
      css: {
        postcss: { plugins: postcssPlugins },
      },
      resolve: {
        alias: aliasEntries,
        conditions: [...vite.defaultClientConditions],
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
      error: errorMessage(err),
    };
  }
}
