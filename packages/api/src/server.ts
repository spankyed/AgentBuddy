import 'dotenv/config';
import { installFatalErrorHandling, writeFatalError } from './boot/errors';
import { setupBackend } from './runtime';
import { createWebSocketServer } from './transport/websocket';

installFatalErrorHandling();

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
