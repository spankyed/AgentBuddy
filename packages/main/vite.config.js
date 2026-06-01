import {getNodeMajorVersion} from '@app/electron-versions';
import {spawn} from 'child_process';
import electronPath from 'electron';
import {defineConfig} from 'vite';
import {viteStaticCopy} from 'vite-plugin-static-copy';

export default defineConfig(({mode}) => /** @type {import('vite').UserConfig} */ ({
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
    electronCjsDefaultImport(),
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

function electronCjsDefaultImport() {
  return {
    name: 'electron-cjs-default-import',
    generateBundle(_options, bundle) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk') continue;
        chunk.code = chunk.code.replace(
          /^import \{([^}]+)\} from "electron";/m,
          (_match, imports) => `import electron from "electron";\nconst {${imports}} = electron;`,
        );
      }
    },
  };
}

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
      
      electronApp = spawn(String(electronPath), electronArgs, {
        stdio: 'inherit',
      });

      /** Stops the watch script when the application has been quit */
      electronApp.addListener('exit', process.exit);
    },
  };
}
