import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import type { Plugin as VitePlugin } from 'vite';
import { getSharedFeDeps, getSdkFeModules } from './shared-deps';

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
  const lines = [`const __m = window.__abuddy.${globalKey};`];
  for (const name of namedExports) {
    lines.push(`export const ${name} = __m.${name};`);
  }
  lines.push(`export default __m.default;`);
  return lines.join('\n');
}

export function packExternalsPlugin(packDir: string): VitePlugin {
  const feDeps = getSharedFeDeps();
  const sdkModules = getSdkFeModules();

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

  function discoverSourceExports(specifier: string): string[] {
    try {
      const req = createRequire(path.join(packDir, 'package.json'));
      const sourcePath = req.resolve(specifier);
      return parseNamedExports(fs.readFileSync(sourcePath, 'utf-8'));
    } catch {}
    return [];
  }

  return {
    name: 'pack-externals',
    enforce: 'pre',

    resolveId(source) {
      if (feDeps[source]) {
        return EXTERNAL_PREFIX + source;
      }
      if (sdkModules[source]) {
        return EXTERNAL_PREFIX + source;
      }
      if (source.startsWith('@abuddy/sdk') && !sdkModules[source]) {
        try {
          const req = createRequire(path.join(packDir, 'package.json'));
          return req.resolve(source);
        } catch {
          return undefined;
        }
      }
    },

    load(id) {
      if (!id.startsWith(EXTERNAL_PREFIX)) return;
      const specifier = id.slice(EXTERNAL_PREFIX.length);

      const hostDep = feDeps[specifier];
      if (hostDep) {
        return generateGlobalProxy(hostDep.globalKey, discoverRuntimeExports(specifier));
      }

      const sdkMod = sdkModules[specifier];
      if (sdkMod) {
        return generateGlobalProxy(sdkMod.globalKey, discoverSourceExports(specifier));
      }
    },
  };
}

export interface BundleFEOptions {
  packDir: string;
  outputDir: string;
  entryPoint: string;
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
  const { packDir, outputDir, entryPoint } = options;

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
      },
      build: {
        lib: {
          entry: entryPoint,
          formats: ['es'],
          fileName: 'fe',
        },
        outDir: outputDir,
        emptyOutDir: false,
        sourcemap: true,
        minify: false,
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
