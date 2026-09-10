import {build, createServer} from 'vite';
import { fork } from 'child_process';
import path from 'path';

/**
 * This script is designed to run multiple packages of your application in a special development mode.
 * To do this, you need to follow a few steps:
 */


/**
 * 1. We create a few flags to let everyone know that we are in development mode.
 */
const mode = 'development';
process.env.NODE_ENV = mode;
process.env.MODE = mode;


/**
 * 2. We create a development server for the renderer. It is assumed that the renderer exists and is located in the “renderer” package.
 * This server should be started first because other packages depend on its settings.
 */
/**
 * @type {import('vite').ViteDevServer}
 */
const rendererWatchServer = await createServer({
  mode,
  root: path.resolve('packages/renderer'),
});

await rendererWatchServer.listen();


/**
 * 3. We are creating a simple provider plugin.
 * Its only purpose is to provide access to the renderer dev-server to all other build processes.
 */
/** @type {import('vite').Plugin} */
const rendererWatchServerProvider = {
  name: '@app/renderer-watch-server-provider',
  api: {
    provideRendererWatchServer() {
      return rendererWatchServer;
    },
  },
};


/**
 * 4. Start building all other packages.
 * For each of them, we add a plugin provider so that each package can implement its own hot update mechanism.
 */

/** @type {string[]} */
const packagesToStart = [
  'packages/preload',
  'packages/main',
];

// Start built-in pack dev watch (compiles default-setup to CJS for BE hot reload)
// Wait for initial build so dev-entry.cjs exists before the API boots.
const devBuild = fork(path.resolve('packages/default-setup/dev-build.mjs'), ['--watch'], {
  stdio: 'inherit',
});
await new Promise((resolve) => {
  devBuild.on('message', (msg) => { if (msg.type === 'ready') resolve(); });
  devBuild.on('exit', resolve);
});

for (const pkg of packagesToStart) {
  await build({
    mode,
    root: path.resolve(pkg),
    plugins: [
      rendererWatchServerProvider,
    ],
  });
}
