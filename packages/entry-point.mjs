import {initApp} from './main/dist/index.js';
import {fileURLToPath} from 'node:url';

// Handle errors appropriately based on environment
if (process.env.NODE_ENV === 'development' || process.env.PLAYWRIGHT_TEST === 'true' || !!process.env.CI) {
  function showAndExit(...args) {
    console.error(...args);
    process.exit(1);
  }

  process.on('uncaughtException', showAndExit);
  process.on('unhandledRejection', showAndExit);
} else {
  // In production, use electron-log to capture crashes to ~/Library/Logs/AgentBuddy/
  const log = await import('electron-log/main');
  log.default.errorHandler.startCatching({
    onError({ error }) {
      // EPIPE errors are common when child processes exit — suppress them
      if (error?.code === 'EPIPE') return false;
    },
  });
}

// noinspection JSIgnoredPromiseFromCall
/**
 * We resolve '@app/renderer' and '@app/preload'
 * here and not in '@app/main'
 * to observe good practices of modular design.
 * This allows fewer dependencies and better separation of concerns in '@app/main'.
 * Thus,
 * the main module remains simplistic and efficient
 * as it receives initialization instructions rather than direct module imports.
 */
initApp(
  {
    renderer: (process.env.MODE === 'development' && !!process.env.VITE_DEV_SERVER_URL) ?
      new URL(process.env.VITE_DEV_SERVER_URL)
      : {
        path: fileURLToPath(new URL('./renderer/dist/index.html', import.meta.url)),
      },

    preload: {
      path: fileURLToPath(new URL('./preload/dist/exposed.mjs', import.meta.url)),
    },
  },
);
