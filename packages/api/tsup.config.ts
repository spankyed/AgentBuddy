import { defineConfig } from 'tsup';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { builtInPackLoadersModule, discoverBuiltInPacksForBuild } from '@abuddy/host/build/discover';
import { readSubpathImports, resolveWithExtensions } from '@abuddy/host/build/subpath-imports';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packagesRoot = path.resolve(__dirname, '..');
const apiSrc = path.resolve(__dirname, 'src');

const builtInPacks = discoverBuiltInPacksForBuild(packagesRoot);
const builtInPackSrcDirs = builtInPacks.map(p => p.srcDir);
// The generated module's imports resolve from the module that imports it (runtime/index.ts)
const packLoaderDir = path.resolve(__dirname, 'src', 'runtime');

function tryResolve(base: string, subpath: string): string | null {
  const candidates = [
    path.join(base, subpath + '.ts'),
    path.join(base, subpath, 'index.ts'),
    path.join(base, subpath + '.js'),
    path.join(base, subpath, 'index.js'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

export default defineConfig((options) => {
  const isDev = options.env?.NODE_ENV === 'development';
  return {
    entry: isDev ? ['src/server.ts'] : ['src/types.ts', 'src/server.ts'],
    format: isDev ? ['esm'] : ['esm', 'cjs'],
    dts: !isDev,
    shims: true,
    minify: !isDev,
    external: ['typescript', 'esbuild'],
    // Bundled CommonJS dependencies require Node builtins (yaml requires 'process'); ESM output has no
    // require, so give it one, as the CLI bundle does
    banner: ({ format }) => (format === 'esm'
      ? { js: "import { createRequire as __abuddyCreateRequire } from 'node:module'; const require = __abuddyCreateRequire(import.meta.url);" }
      : {}),
    esbuildOptions(esbuildOptions) {
      // Workspace @abuddy/* packages bundle from source (see their package.json exports).
      // Custom conditions replace esbuild's implicit 'module' condition, so keep it.
      esbuildOptions.conditions = ['@abuddy/source', 'module'];
    },
    esbuildPlugins: [
    {
      name: 'externalize-vue',
      setup(build) {
        build.onResolve({ filter: /\.vue$/ }, () => ({ path: '__vue_stub__', external: true }));
      },
    },
    {
      // Generates a virtual module that exports a loader map for built-in packs.
      // Each entry is a dynamic import() with a string-literal path so esbuild
      // traces the dependency and bundles it. runtime/index.ts imports this module
      // and passes the loaders to loadBuiltInPacks — new built-in packs are picked up
      // automatically via the build-time scan (no manual registration needed).
      name: 'built-in-pack-loaders',
      setup(build) {
        const VIRTUAL_ID = 'virtual:built-in-pack-loaders';
        const NAMESPACE = 'built-in-pack-loaders';

        build.onResolve({ filter: new RegExp(`^${VIRTUAL_ID}$`) }, () => ({
          path: VIRTUAL_ID,
          namespace: NAMESPACE,
        }));

        build.onLoad({ filter: /.*/, namespace: NAMESPACE }, () => ({
          contents: builtInPackLoadersModule(builtInPacks, packLoaderDir),
          loader: 'ts',
          resolveDir: packLoaderDir,
        }));
      },
    },
    {
      /**
       * A built-in pack's own `#…` imports, which esbuild resolves the mapping for and then refuses.
       *
       * Measured with esbuild 0.25.12: given a pack's `"imports": { "#generated/*": "./src/__generated__/*" }`
       * it finds the target and says so — *"The module ./src/__generated__/services was not found on the file
       * system"* — because the file is `.ts` and the specifier has no extension, which is Node's ESM rule.
       * Supplying the suffix is the whole job, and `@abuddy/cli`'s backend bundle does it with the same two
       * functions (`@abuddy/host/build/subpath-imports`) rather than a second copy.
       *
       * It went unnoticed until the built-in pack's own imports moved to `#generated/…`: the five that
       * already used it were all under `src/seeds/flows/`, which `abuddy build` compiles and this build
       * never sees.
       */
      name: 'resolve-pack-subpath-imports',
      setup(build) {
        const importsByPack = new Map(builtInPacks.map((pack) => [pack.srcDir, readSubpathImports(path.dirname(pack.srcDir))]));
        build.onResolve({ filter: /^#/ }, (args) => {
          const srcDir = builtInPackSrcDirs.find((dir) => args.importer.startsWith(dir));
          if (!srcDir) return undefined;
          const packDir = path.dirname(srcDir);
          for (const [pattern, target] of Object.entries(importsByPack.get(srcDir) ?? {})) {
            // Wildcard and exact both, as `abuddy build`'s backend bundle does: a pack declaring
            // `"#env": "./src/env.ts"` would otherwise resolve there and fail here, which is the kind of
            // disagreement between two bundlers over one manifest that this whole seam exists to avoid.
            if (pattern.endsWith('/*') && target.endsWith('/*')) {
              const prefix = pattern.slice(0, -1);
              if (!args.path.startsWith(prefix)) continue;
              const resolved = resolveWithExtensions(path.resolve(packDir, target.slice(0, -1) + args.path.slice(prefix.length)));
              if (resolved) return { path: resolved };
            } else if (pattern === args.path) {
              const resolved = resolveWithExtensions(path.resolve(packDir, target));
              if (resolved) return { path: resolved };
            }
          }
          return undefined;
        });
      },
    },
    {
      name: 'resolve-at-aliases',
      setup(build) {
        build.onResolve({ filter: /^@\// }, (args) => {
          const subpath = args.path.slice(2);

          const packSrc = builtInPackSrcDirs.find(d => args.importer.startsWith(d));
          if (packSrc) {
            const resolved = tryResolve(packSrc, subpath);
            if (resolved) return { path: resolved };
          }

          const resolved = tryResolve(apiSrc, subpath);
          if (resolved) return { path: resolved };

          return undefined;
        });
      },
    },
    ],
  };
});
