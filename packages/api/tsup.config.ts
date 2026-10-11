import { defineConfig } from 'tsup';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiSrc = path.resolve(__dirname, 'src');

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
    // **The production build owns this directory; the dev build only adds to it.** Code splitting names
    // chunks by content, so a bundle that stops importing one leaves it behind — and `electron-builder.mjs`
    // ships `packages/**/*`, so what is left behind is shipped. 47 `pack-entry-*.js` chunks were, from when
    // the api still bundled a pack's backend. The dev build must not clean: it emits no declarations, and
    // `dist/types.d.ts` is what the renderer's typecheck resolves `@app/api` to.
    clean: !isDev,
    // **What to watch is on the command line, not here, and that is not a preference.** tsup watches a
    // *directory* rather than the module graph, so `@apack/host` and `@apack/sdk` — both inlined into
    // this bundle by the `@apack/source` condition below — have to be named or an edit to either rebuilds
    // nothing: measured 2026-10-10, no rebuild in two and a half minutes. Naming them here does not work,
    // because a `--watch` flag *overrides* a `watch` in the config rather than merging with it (measured
    // the same day: the config's paths were ignored). So they live in `build:dev:watch`, which is the one
    // invocation that wants them.
    format: isDev ? ['esm'] : ['esm', 'cjs'],
    dts: !isDev,
    shims: true,
    minify: !isDev,
    external: ['typescript', 'esbuild'],
    // Bundled CommonJS dependencies require Node builtins (yaml requires 'process'); ESM output has no
    // require, so give it one, as the CLI bundle does
    banner: ({ format }) => (format === 'esm'
      ? { js: "import { createRequire as __apackCreateRequire } from 'node:module'; const require = __apackCreateRequire(import.meta.url);" }
      : {}),
    esbuildOptions(esbuildOptions) {
      // Workspace @apack/* packages bundle from source (see their package.json exports).
      // Custom conditions replace esbuild's implicit 'module' condition, so keep it.
      esbuildOptions.conditions = ['@apack/source', 'module'];
    },
    esbuildPlugins: [
    {
      name: 'externalize-vue',
      setup(build) {
        build.onResolve({ filter: /\.vue$/ }, () => ({ path: '__vue_stub__', external: true }));
      },
    },
    {
      /**
       * The API's own `@/`, and only the API's (`packages/api/tsconfig.json` maps it to `src/*`).
       *
       * It used to try the importer's built-in pack first, because a pack named its own modules that way too
       * — a per-importer rule that this config, the renderer's, the pack's vitest config and `apack build`
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
