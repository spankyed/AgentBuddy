import 'dotenv/config';
import { setupBackend } from './setup/backend';
import { createWebSocketServer } from './setup/websocket';

// Catch-all handlers — write structured error to stderr so the main process can display it
function writeFatalError(error: unknown, source: string) {
  const err = error instanceof Error ? error : new Error(String(error));
  process.stderr.write(JSON.stringify({
    __fatal: true,
    message: err.message,
    stack: err.stack,
    source,
  }) + '\n');
}

process.on('uncaughtException', (error) => {
  writeFatalError(error, 'uncaughtException');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  writeFatalError(reason, 'unhandledRejection');
  process.exit(1);
});

// Initialize backend systems, then start WebSocket server
(async () => {
  try {
    await setupBackend();
  } catch (error) {
    writeFatalError(error, 'setupBackend');
    process.exit(1);
  }

  try {
    createWebSocketServer();
  } catch (error) {
    writeFatalError(error, 'createWebSocketServer');
    process.exit(1);
  }
})();
