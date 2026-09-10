import {build, createServer} from 'vite';
import { fork, spawn } from 'child_process';
import path from 'path';

const mode = 'development';
process.env.NODE_ENV = mode;
process.env.MODE = mode;

// ── 1. Start API build, dev-build, and renderer server concurrently ──

// API backend build (skips tsc, single ESM format, no DTS/minify)
const apiBuild = spawn('npm', ['run', 'build:be:dev'], {
  stdio: 'inherit',
  shell: true,
});
const apiBuildDone = new Promise((resolve) => {
  apiBuild.on('exit', (code) => {
    if (code !== 0) {
      console.error(`[dev-mode] API build failed with code ${code}`);
      process.exit(1);
    }
    resolve();
  });
});

// Built-in pack dev watch (compiles default-setup to CJS for BE hot reload)
const devBuild = fork(path.resolve('packages/default-setup/dev-build.mjs'), ['--watch'], {
  stdio: 'inherit',
});
process.on('exit', () => devBuild.kill());
const devBuildReady = new Promise((resolve) => {
  devBuild.on('message', (msg) => { if (msg.type === 'ready') resolve(); });
  devBuild.on('exit', resolve);
});

// Renderer dev server (other packages depend on its settings)
/** @type {import('vite').ViteDevServer} */
const rendererWatchServer = await createServer({
  mode,
  root: path.resolve('packages/renderer'),
});
await rendererWatchServer.listen();

// Wait for dev-build initial compile (so dev-entry.cjs exists before API boots)
await devBuildReady;

// ── 2. Renderer watch server provider plugin ──

/** @type {import('vite').Plugin} */
const rendererWatchServerProvider = {
  name: '@app/renderer-watch-server-provider',
  api: {
    provideRendererWatchServer() {
      return rendererWatchServer;
    },
  },
};

// ── 3. Ensure API build is done before Electron spawns ──
await apiBuildDone;

// ── 4. Build preload and main in parallel ──
/** @type {string[]} */
const packagesToStart = [
  'packages/preload',
  'packages/main',
];

await Promise.all(
  packagesToStart.map(pkg =>
    build({
      mode,
      root: path.resolve(pkg),
      plugins: [rendererWatchServerProvider],
    })
  )
);
