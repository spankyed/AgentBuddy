import { defineConfig } from 'tsup';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { discoverBuiltInPacksForBuild } from '@abuddy/host/build/discover';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packagesRoot = path.resolve(__dirname, '..');
const apiSrc = path.resolve(__dirname, 'src');

const builtInPacks = discoverBuiltInPacksForBuild(packagesRoot);
const builtInPackSrcDirs = builtInPacks.map(p => p.srcDir);
const packLoaderDir = path.resolve(__dirname, 'src', 'packs');

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
      // traces the dependency and bundles it. pack-loader.ts imports this module
      // and calls the loaders at runtime — new built-in packs are picked up
      // automatically via the build-time scan (no manual registration needed).
      name: 'built-in-pack-loaders',
      setup(build) {
        const VIRTUAL_ID = 'virtual:built-in-pack-loaders';
        const NAMESPACE = 'built-in-pack-loaders';

        build.onResolve({ filter: new RegExp(`^${VIRTUAL_ID}$`) }, () => ({
          path: VIRTUAL_ID,
          namespace: NAMESPACE,
        }));

        build.onLoad({ filter: /.*/, namespace: NAMESPACE }, () => {
          const packsWithEntry = builtInPacks.filter(p => p.entryPath);
          if (packsWithEntry.length === 0) {
            throw new Error('[built-in-pack-loaders] No built-in packs found — production bundle would have no packs to load');
          }
          const lines = packsWithEntry.map(p => {
            const relPath = path.relative(packLoaderDir, p.entryPath!).replace(/\\/g, '/');
            return `  ${JSON.stringify(p.id)}: () => import('${relPath}'),`;
          });
          return {
            contents: `export default {\n${lines.join('\n')}\n};\n`,
            loader: 'ts',
            resolveDir: packLoaderDir,
          };
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
