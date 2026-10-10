import {getNodeMajorVersion} from '@app/electron-versions';
import {spawn} from 'child_process';
import electronPath from 'electron';
import {defineConfig, defaultServerConditions} from 'vite';
import {viteStaticCopy} from 'vite-plugin-static-copy';

export default defineConfig(({mode}) => /** @type {import('vite').UserConfig} */ ({
  define: {
    __ABUDDY_CHANNEL__: JSON.stringify(process.env.ABUDDY_ENV || ''),
  },
  // Bundle SDK and host source into main: packaged builds strip .ts files, so they can't be imported at runtime
  ssr: {
    noExternal: [/^@abuddy\/(sdk|host)/],
    // Workspace @abuddy/* packages resolve to source (see their package.json exports)
    resolve: {conditions: ['@abuddy/source', ...defaultServerConditions]},
  },
  build: {
    ssr: true,
    sourcemap: mode === 'development' ? 'inline' : false,
    outDir: 'dist',
    assetsDir: '.',
    target: `node${getNodeMajorVersion()}`,
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
    },
    rollupOptions: {
      output: {
        entryFileNames: '[name].js',
      },
    },
    emptyOutDir: true,
    reportCompressedSize: false,
  },
  plugins: [
    viteStaticCopy({
      environment: 'ssr', // Required: Vite 7 Environment API defaults to 'client', skipping copies in SSR builds
      targets: [
        {
          src: 'src/modules/splash-screen/assets/*',
          dest: 'assets'
        },
        {
          src: '../../resources/logo.svg',
          dest: 'assets',
          rename: 'logo.svg'
        }
      ]
    }),
    handleHotReload(),
  ],
}));


/**
 * Implement Electron app reload when some file was changed
 * @return {import('vite').Plugin}
 */
function handleHotReload() {

  /** @type {ChildProcess} */
  let electronApp = null;

  /** @type {import('vite').ViteDevServer|null} */
  let rendererWatchServer = null;

  return {
    name: '@app/main-process-hot-reload',

    config(config, env) {
      if (env.mode !== 'development') {
        return;
      }

      const rendererWatchServerProvider = config.plugins.find(p => p.name === '@app/renderer-watch-server-provider');
      if (!rendererWatchServerProvider) {
        throw new Error('Renderer watch server provider not found');
      }

      rendererWatchServer = rendererWatchServerProvider.api.provideRendererWatchServer();

      process.env.VITE_DEV_SERVER_URL = rendererWatchServer.resolvedUrls.local[0];

      return {
        build: {
          watch: {},
        },
      };
    },

    writeBundle() {
      if (process.env.NODE_ENV !== 'development') {
        return;
      }

      /** Kill electron if a process already exists */
      if (electronApp !== null) {
        electronApp.removeListener('exit', process.exit);
        electronApp.kill('SIGINT');
        electronApp = null;
      }

      /** Spawn a new electron process */
      const inspectMode = process.env.ELECTRON_INSPECT === 'true';
      const electronArgs = inspectMode ? ['--inspect', '.'] : ['.'];

      if (inspectMode) {
        console.log('Starting Electron with Node.js inspector on port 9229');
      }

      // `npm start` is a development run by definition (this whole hook is behind that check), so the app
      // it spawns is attachable and publishes a session. The port is Chromium's to choose — a fixed one
      // collides with whatever holds it and with a second app
      electronArgs.push('--remote-debugging-port=0');

      // Before the spawn, so the port file below is this app's rather than one a previous run left in the
      // data dir — Chromium's `DevToolsActivePort` outlives the browser that wrote it
      const launchedAt = Date.now();
      electronApp = spawn(String(electronPath), electronArgs, {
        stdio: 'inherit',
      });

      /**
       * The session file, so `abuddy drive` can reach the app this loop is holding — which is the half
       * worth having: `abuddy dev` serves a *pack's* frontend, where this one serves the renderer itself,
       * so it is the app you are most often looking at.
       *
       * **The pid is Electron's here, where `abuddy dev` records its own.** The field means "the process to
       * signal to end this", and the direction differs between the two: `dev` is a supervisor whose
       * teardown closes the app, while this watcher exits *with* Electron (the listener below). So in both
       * cases one signal ends the app and the tooling holding it.
       *
       * Fire and forget: the port appears a moment after launch, and a run that never becomes attachable
       * is still a perfectly good dev loop. It is republished on every restart, because each rebuild
       * spawns a new app with a new port.
       */
      const spawned = electronApp;
      void (async () => {
        try {
          const { publishSession, readDevToolsPort } = await import('@abuddy/host/dev-session');
          const { resolveAppContext } = await import('@abuddy/sdk/env');
          // `development` outright: this is the watcher, not a process the app spawned, so there is no
          // `ABUDDY_ENV` in its environment to infer a build from — and it is the same "by definition"
          // the debug-port push above rests on. Asking with no build threw here, which published nothing
          // and reported `not attachable` on a run that was otherwise perfectly fine
          const { userDataDir } = resolveAppContext({ build: 'development' });
          const debugPort = await readDevToolsPort(userDataDir, { after: launchedAt });
          if (spawned !== electronApp) return;  // a rebuild replaced it while the port was being waited for
          const unpublish = publishSession({
            debugPort, dataDir: userDataDir, supervisorPid: spawned.pid ?? process.pid, startedBy: 'dev',
          });
          spawned.addListener('exit', unpublish);
        } catch (error) {
          console.warn(`[dev] not attachable: ${error instanceof Error ? error.message : error}`);
        }
      })();

      /** Stops the watch script when the application has been quit */
      electronApp.addListener('exit', process.exit);
    },
  };
}
