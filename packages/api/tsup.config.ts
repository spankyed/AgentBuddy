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

const builtInPackSrcDirs = discoverBuiltInPackSrcDirs();
const packLoaderDir = path.resolve(__dirname, 'src', 'packs');

// Scans packages/ for abuddy.json with builtIn: true and returns pack ID +
// absolute path to the pack-entry file. Used by the built-in-pack-loaders
// esbuild plugin to generate import() expressions the bundler can trace.
function discoverBuiltInPackEntries(): { id: string; entryPath: string }[] {
  const entries: { id: string; entryPath: string }[] = [];
  for (const entry of fs.readdirSync(packagesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(packagesRoot, entry.name, 'abuddy.json');
    if (!fs.existsSync(manifestPath)) continue;
    try {
      const m = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      if (!m.builtIn || !m.id) continue;
      const entryPath = path.join(packagesRoot, entry.name, 'src', '__generated__', 'pack-entry');
      if (fs.existsSync(entryPath + '.ts') || fs.existsSync(entryPath + '.js')) {
        entries.push({ id: m.id, entryPath });
      }
    } catch {}
  }
  return entries;
}

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
          const packs = discoverBuiltInPackEntries();
          if (packs.length === 0) {
            throw new Error('[built-in-pack-loaders] No built-in packs found — production bundle would have no packs to load');
          }
          const lines = packs.map(p => {
            const relPath = path.relative(packLoaderDir, p.entryPath).replace(/\\/g, '/');
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
});
