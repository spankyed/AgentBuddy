import { defineConfig } from 'tsup';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { builtInPackLoadersModule, discoverBuiltInPacksForBuild } from '@abuddy/host/build/discover';

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
       * The API's own `@/`, and only the API's (`packages/api/tsconfig.json` maps it to `src/*`).
       *
       * It used to try the importer's built-in pack first, because a pack named its own modules that way too
       * — a per-importer rule that this config, the renderer's, the pack's vitest config and `abuddy build`
       * each implemented separately. Packs use `#` subpath imports now, and esbuild resolves those from the
       * pack's own `package.json` with no help from here, since each names the file that is there.
       */
      name: 'resolve-at-aliases',
      setup(build) {
        build.onResolve({ filter: /^@\// }, (args) => {
          const resolved = tryResolve(apiSrc, args.path.slice(2));
          return resolved ? { path: resolved } : undefined;
        });
      },
    },
    ],
  };
});
