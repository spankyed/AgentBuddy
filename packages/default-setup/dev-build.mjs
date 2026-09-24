import * as esbuild from 'esbuild';
import * as crypto from 'crypto';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
// SDK source, so run with --import tsx --conditions=@abuddy/source (the build script and dev-mode.js do)
import { resolveAppContext } from '@abuddy/sdk/env';
import { API_HOST, API_TOKEN_HEADER } from '@abuddy/sdk/utils/pure';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(__dirname, 'src');
const entryPoint = path.resolve(srcDir, '__generated__/pack-entry.ts');
// The pack's backend runtime, in the pack layout (runtime/index.cjs): the API loads it in development,
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

const watchMode = process.argv.includes('--watch');

// Where the development app's API writes its port and the token /dev/reload requires
const { apiPortFile, apiTokenFile } = resolveAppContext({ env: 'development' });

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
  // Every package stays external: the app bridges the shared-instance packages (@abuddy/sdk, @abuddy/ears)
  // to its own and resolves the rest itself
  packages: 'external',
  plugins: [aliasPlugin, vueStubPlugin],
  logLevel: 'info',
};

let isFirstBuild = true;
let reloadTimer = null;
const DEBOUNCE_MS = 300;

function readDevFile(file) {
  try { return fs.readFileSync(file, 'utf-8').trim(); } catch {}
  return null;
}

/**
 * The port a running API published, or null. Not whether the process that published it is still there:
 * the POST below is in a try that ignores a failure, so a port nothing is listening on already comes out
 * the same way — and nothing can close the gap between the check and the request anyway.
 */
function readDevPort(file) {
  const raw = readDevFile(file);
  if (!raw) return null;
  try {
    const { port } = JSON.parse(raw);
    return Number.isInteger(port) ? port : null;
  } catch {
    return null;
  }
}

async function notifyReload() {
  const port = readDevPort(apiPortFile);
  const token = readDevFile(apiTokenFile);
  if (!port || !token) return;
  try {
    const res = await fetch(`http://${API_HOST}:${port}/dev/reload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [API_TOKEN_HEADER]: token },
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
