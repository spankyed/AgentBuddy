import {initApp} from './main/dist/index.js';
import {fileURLToPath} from 'node:url';

function readArgValue(name) {
  const inline = process.argv.find(arg => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);

  const index = process.argv.indexOf(name);
  if (index >= 0) return process.argv[index + 1];

  return undefined;
}

function readDemoCaptureConfig() {
  const id = readArgValue('--demo');
  const scene = readArgValue('--demo-scene');
  const captureOutput = readArgValue('--capture-output');

  if (!id && !scene && !captureOutput) return undefined;

  if (!id || !scene || !captureOutput) {
    throw new Error('Demo capture requires --demo, --demo-scene, and --capture-output.');
  }

  return {
    enabled: true,
    id,
    scene,
    captureOutput,
  };
}

// Handle errors appropriately based on environment
if (process.env.NODE_ENV === 'development' || process.env.PLAYWRIGHT_TEST === 'true' || !!process.env.CI) {
  function showAndExit(...args) {
    console.error(...args);
    process.exit(1);
  }

  process.on('uncaughtException', showAndExit);
  process.on('unhandledRejection', showAndExit);
} else {
  // In production, handle EPIPE errors gracefully
  process.on('uncaughtException', (error) => {
    // EPIPE errors are common when child processes exit
    if (error.code === 'EPIPE') {
      console.warn('EPIPE error caught (child process pipe closed):', error.message);

      return; // Silently ignore EPIPE errors
    }
    // For other errors, log but don't crash the app
    console.error('Uncaught exception:', error);
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled promise rejection:', reason);
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

    demoCapture: readDemoCaptureConfig(),
  },
);
