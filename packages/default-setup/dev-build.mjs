import * as esbuild from 'esbuild';
import * as crypto from 'crypto';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(__dirname, 'src');
const entryPoint = path.resolve(srcDir, '__generated__/pack-entry.ts');
// The pack's backend runtime, in the bundle layout (runtime/index.cjs): the API loads it in development,
// and the app publishes it with the snapshot and build/ for packs depending on default-setup
const outfile = path.resolve(__dirname, 'dist/runtime/index.cjs');
// The compiled seeds index (abuddy build) this runtime is built beside, by its sha256: the app publishes
// the runtime with the compiled seeds only when it matches, so a stale runtime never ships with newer seeds
const seedsIndex = path.resolve(__dirname, 'dist/seeds.json');
const seedsIndexHash = path.resolve(__dirname, 'dist/runtime/seeds-index.sha256');

function recordSeedsIndex() {
  if (fs.existsSync(seedsIndex)) {
    fs.writeFileSync(seedsIndexHash, crypto.createHash('sha256').update(fs.readFileSync(seedsIndex)).digest('hex'));
  } else {
    fs.rmSync(seedsIndexHash, { force: true });
  }
}

import * as os from 'os';
const watchMode = process.argv.includes('--watch');

function resolveAppDataDir(appName) {
  const home = os.homedir();
  switch (process.platform) {
    case 'darwin': return path.join(home, 'Library', 'Application Support', appName);
    case 'win32': return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), appName);
    default: return path.join(process.env.XDG_DATA_HOME || path.join(home, '.local', 'share'), appName);
  }
}
const PORT_FILE = path.join(resolveAppDataDir('abuddy-dev'), 'api-port');

const aliasPlugin = {
  name: 'resolve-aliases',
  setup(build) {
    const aliases = {
      '@/__generated__/': path.join(srcDir, '__generated__/'),
      '@/features/': path.join(srcDir, 'features/'),
      '@/extensions/': path.join(srcDir, 'extensions/'),
    };

    build.onResolve({ filter: /^@\// }, (args) => {
      for (const [prefix, dir] of Object.entries(aliases)) {
        if (args.path.startsWith(prefix)) {
          const rest = args.path.slice(prefix.length);
          const candidates = [
            path.join(dir, rest + '.ts'),
            path.join(dir, rest, 'index.ts'),
            path.join(dir, rest + '.js'),
            path.join(dir, rest, 'index.js'),
          ];
          for (const c of candidates) {
            if (fs.existsSync(c)) return { path: c };
          }
        }
      }
      return undefined;
    });
  },
};

const externalizeSdkPlugin = {
  name: 'externalize-sdk',
  setup(build) {
    build.onResolve({ filter: /^@abuddy\/sdk/ }, (args) => ({
      path: args.path,
      external: true,
    }));
  },
};

const vueStubPlugin = {
  name: 'stub-vue',
  setup(build) {
    build.onResolve({ filter: /\.vue$/ }, () => ({
      path: '__vue_stub__',
      external: true,
    }));
  },
};

const buildOptions = {
  entryPoints: [entryPoint],
  outfile,
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node23',
  sourcemap: true,
  packages: 'external',
  plugins: [externalizeSdkPlugin, aliasPlugin, vueStubPlugin],
  logLevel: 'info',
};

let isFirstBuild = true;
let reloadTimer = null;
const DEBOUNCE_MS = 300;

function getApiPort() {
  try { return fs.readFileSync(PORT_FILE, 'utf-8').trim(); } catch {}
  return null;
}

async function notifyReload() {
  const port = getApiPort();
  if (!port) return;
  try {
    const res = await fetch(`http://localhost:${port}/dev/reload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ packId: 'default-setup', builtIn: true }),
    });
    if (res.ok) {
      console.log('[dev-build] Reload triggered');
    } else {
      const body = await res.text();
      console.warn(`[dev-build] Reload failed (${res.status}): ${body}`);
    }
  } catch {
    // API not ready yet
  }
}

if (watchMode) {
  const ctx = await esbuild.context({
    ...buildOptions,
    plugins: [
      ...buildOptions.plugins,
      {
        name: 'on-rebuild',
        setup(build) {
          build.onEnd((result) => {
            if (result.errors.length === 0) {
              recordSeedsIndex();
              if (isFirstBuild) {
                isFirstBuild = false;
                process.send?.({ type: 'ready' });
                console.log('[dev-build] Initial build complete');
              } else {
                clearTimeout(reloadTimer);
                reloadTimer = setTimeout(notifyReload, DEBOUNCE_MS);
              }
            }
          });
        },
      },
    ],
  });
  await ctx.watch();
  console.log('[dev-build] Watching for changes...');
} else {
  await esbuild.build(buildOptions);
  recordSeedsIndex();
  console.log('[dev-build] Build complete');
}
