import {getChromeMajorVersion} from '@app/electron-versions';
import {defineConfig} from 'vite';

export default defineConfig(({mode}) => /** @type {import('vite').UserConfig} */ ({
  build: {
    ssr: true,
    sourcemap: mode === 'development' ? 'inline' : false,
    outDir: 'dist',
    target: `chrome${getChromeMajorVersion()}`,
    assetsDir: '.',
    lib: {
      entry: ['src/exposed.ts'],
    },
    rollupOptions: {
      output: [
        {
          // ESM preload scripts must have the .mjs extension
          // https://www.electronjs.org/docs/latest/tutorial/esm#esm-preload-scripts-must-have-the-mjs-extension
          entryFileNames: '[name].mjs',
        },
      ],
    },
    emptyOutDir: true,
    reportCompressedSize: false,
  },
  plugins: [handleHotReload()],
}));


/**
 * Implement Electron webview reload when some file was changed
 * @return {import('vite').Plugin}
 */
function handleHotReload() {
  /** @type {import('vite').ViteDevServer|null} */
  let rendererWatchServer = null;

  return {
    name: '@app/preload-process-hot-reload',

    config(config, env) {
      if (env.mode !== 'development') {
        return;
      }

      const rendererWatchServerProvider = config.plugins.find(p => p.name === '@app/renderer-watch-server-provider');
      if (!rendererWatchServerProvider) {
        throw new Error('Renderer watch server provider not found');
      }

      rendererWatchServer = rendererWatchServerProvider.api.provideRendererWatchServer();

      return {
        build: {
          watch: {},
        },
      };
    },

    writeBundle() {
      if (!rendererWatchServer) {
        return;
      }

      rendererWatchServer.ws.send({
        type: 'full-reload',
      });
    },
  };
}
