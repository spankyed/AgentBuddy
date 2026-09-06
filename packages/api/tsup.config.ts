import { defineConfig } from 'tsup';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultSetupSrc = path.resolve(__dirname, '..', 'default-setup', 'src');
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

export default defineConfig({
  entry: ['src/types.ts', 'src/server.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  shims: true,
  minify: true,
  external: ['typescript', 'esbuild'],
  esbuildPlugins: [
    {
      name: 'externalize-vue',
      setup(build) {
        build.onResolve({ filter: /\.vue$/ }, () => ({ path: '__vue_stub__', external: true }));
      },
    },
    {
      name: 'rewrite-pack-loader',
      setup(build) {
        build.onLoad({ filter: /pack-loader\.ts$/ }, async (args) => {
          let contents = await fs.promises.readFile(args.path, 'utf8');
          contents = contents.replace(/esmRequire\(/g, 'require(');
          contents = contents.replace(/esmRequire\.resolve\(/g, 'require.resolve(');
          contents = contents.replace(
            /const PACK_ENTRY = '([^']+)';\nexport async function loadBuiltInPack\(\): Promise<void> \{\n\s+const mod = await import\(PACK_ENTRY\);/,
            "export function loadBuiltInPack(): void {\n  const mod = require('$1');",
          );
          return { contents, loader: 'ts' };
        });
      },
    },
    {
      name: 'resolve-at-aliases',
      setup(build) {
        build.onResolve({ filter: /^@\// }, (args) => {
          const subpath = args.path.slice(2);
          const isDefaultSetup = args.importer.includes('default-setup');

          if (isDefaultSetup) {
            for (const prefix of ['registries/', 'plugins/', 'steps/']) {
              if (subpath.startsWith(prefix)) {
                const resolved = tryResolve(defaultSetupSrc, subpath);
                if (resolved) return { path: resolved };
              }
            }
          }

          const resolved = tryResolve(apiSrc, subpath);
          if (resolved) return { path: resolved };

          return undefined;
        });
      },
    },
  ],
});
