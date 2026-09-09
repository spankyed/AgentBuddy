import { defineConfig } from 'tsup';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packagesRoot = path.resolve(__dirname, '..');
const apiSrc = path.resolve(__dirname, 'src');

function discoverBuiltInPackSrcDirs(): string[] {
  const dirs: string[] = [];
  for (const entry of fs.readdirSync(packagesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(packagesRoot, entry.name, 'abuddy.json');
    if (!fs.existsSync(manifestPath)) continue;
    try {
      const m = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      if (m.builtIn) dirs.push(path.resolve(packagesRoot, entry.name, 'src'));
    } catch {}
  }
  return dirs;
}

const packLoaderDir = path.resolve(__dirname, 'src', 'packs');

function discoverBuiltInPackEntries(): { id: string; relPath: string }[] {
  const entries: { id: string; relPath: string }[] = [];
  for (const entry of fs.readdirSync(packagesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(packagesRoot, entry.name, 'abuddy.json');
    if (!fs.existsSync(manifestPath)) continue;
    try {
      const m = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      if (!m.builtIn || !m.id) continue;
      const packEntry = path.join(packagesRoot, entry.name, 'src', '__generated__', 'pack-entry');
      if (fs.existsSync(packEntry + '.ts') || fs.existsSync(packEntry + '.js')) {
        const relPath = path.relative(packLoaderDir, packEntry).replace(/\\/g, '/');
        entries.push({ id: m.id, relPath });
      }
    } catch {}
  }
  return entries;
}

const builtInPackSrcDirs = discoverBuiltInPackSrcDirs();

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

          const packs = discoverBuiltInPackEntries();
          if (packs.length === 0) {
            throw new Error('[rewrite-pack-loader] No built-in packs discovered — production bundle would have nothing to load');
          }

          const requireLines = packs.map(
            p => `    { const mod = require('${p.relPath}'); registerPack(mod.registration); }`
          ).join('\n');

          const rewritten = contents.replace(
            /\/\/ @tsup-rewrite-start loadBuiltInPacks[\s\S]*?\/\/ @tsup-rewrite-end loadBuiltInPacks/,
            `export function loadBuiltInPacks(): void {\n${requireLines}\n}`,
          );

          if (rewritten === contents) {
            throw new Error('[rewrite-pack-loader] @tsup-rewrite markers not found in pack-loader.ts — production bundle would use dev-time discovery');
          }

          return { contents: rewritten, loader: 'ts' };
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
});
