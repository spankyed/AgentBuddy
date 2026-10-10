import {build, createServer} from 'vite';
import { fork, spawn } from 'child_process';
import path from 'path';

const mode = 'development';
process.env.NODE_ENV = mode;
process.env.MODE = mode;

// ── 1. Start the API build, the pack's backend watcher and the renderer server concurrently ──

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

// The built-in pack's backend watcher: it keeps dist/runtime/index.cjs current and asks the API to
// reload the pack in place. The CLI's own bundler, so there is one esbuild config for a pack's runtime
const devBuild = fork(path.resolve('packages/abuddy-cli/bin/abuddy.mjs'), ['build', '--watch'], {
  cwd: path.resolve('packages/default-setup'),
  stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
});
process.on('exit', () => devBuild.kill());
const devBuildReady = new Promise((resolve) => {
  devBuild.on('message', (msg) => { if (msg.type === 'ready') resolve(); });
  devBuild.on('exit', (code) => {
    if (code !== 0) {
      console.error(`[dev-mode] default-setup's backend watcher failed with code ${code}`);
      process.exit(1);
    }
    resolve();
  });
});

// Renderer dev server (other packages depend on its settings)
/** @type {import('vite').ViteDevServer} */
const rendererWatchServer = await createServer({
  mode,
  root: path.resolve('packages/renderer'),
});
await rendererWatchServer.listen();

// Wait for the first bundle (so dist/runtime/index.cjs exists before the API boots)
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

// ── 3b. Then keep it current: a host, SDK or API edit rebuilds, and the app reloads its API ──
//
// Two builds because only the first is a precondition: Electron must not spawn against a missing bundle,
// so that one is awaited and this one runs for as long as the session does. `ABUDDY_DEV_RELOAD` is what
// tells Electron to watch for its writes, since a watcher here could not restart the API — main owns that
// child. The watched paths are in `build:dev:watch`, and `packages/api/tsup.config.ts` says why there.
const apiWatch = spawn('npm', ['run', 'build:dev:watch', '--workspace', '@app/api'], {
  stdio: 'inherit',
  shell: true,
});
process.on('exit', () => apiWatch.kill());
apiWatch.on('exit', (code) => {
  // A dead watcher leaves the loop silently broken: edits stop landing and nothing says so
  if (code) console.error(`[dev-mode] the API watcher exited with code ${code} — backend edits will not reload`);
});
process.env.ABUDDY_DEV_RELOAD = '1';

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
