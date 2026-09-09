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

interface BuiltInPackEntry {
  id: string;
  name: string;
  version: string;
  dirName: string;
  relPath: string;
}

// Scans packages/ at build time for abuddy.json manifests with builtIn: true.
// The results are baked into the prod bundle by rewrite-pack-loader — no
// runtime filesystem discovery in production.
function discoverBuiltInPackEntries(): BuiltInPackEntry[] {
  const entries: BuiltInPackEntry[] = [];
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
        entries.push({
          id: m.id,
          name: m.name ?? m.id,
          version: m.version ?? '0.0.0',
          dirName: entry.name,
          relPath,
        });
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
      // Replaces loadBuiltInPacks() at bundle time so production has no runtime
      // filesystem discovery. The dev version (in pack-loader.ts between the
      // @tsup-rewrite markers) scans for abuddy.json and dynamically imports
      // each pack. This rewrite replaces that with hardcoded require() calls
      // and a static return value, both derived from the build-time scan above.
      //
      // The rewritten function returns BuiltInPackInfo[] (same as the dev
      // version) so callers can use the return value in both environments.
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

          // packagesDir is passed by the caller (BUILT_IN_PACKS_DIR env var).
          // We use it to reconstruct the full dir path for each pack at runtime
          // so the returned BuiltInPackInfo[] matches the dev version's shape.
          const infoLines = packs.map(
            p => `    { id: ${JSON.stringify(p.id)}, name: ${JSON.stringify(p.name)}, version: ${JSON.stringify(p.version)}, dir: path.join(packagesDir, ${JSON.stringify(p.dirName)}), entry: 'src/__generated__/pack-entry' },`
          ).join('\n');

          const rewritten = contents.replace(
            /\/\/ @tsup-rewrite-start loadBuiltInPacks[\s\S]*?\/\/ @tsup-rewrite-end loadBuiltInPacks/,
            `export function loadBuiltInPacks(packagesDir: string) {\n${requireLines}\n  return [\n${infoLines}\n  ];\n}`,
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
