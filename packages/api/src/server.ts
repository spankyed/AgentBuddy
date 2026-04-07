import 'dotenv/config';
import { setupBackend, shutdownBackend } from './setup/backend';
import { createWebSocketServer } from './setup/websocket';

// Graceful shutdown on SIGTERM (sent by main process before quit)
process.on('SIGTERM', () => {
  shutdownBackend();
  process.exit(0);
});

// Initialize backend systems
(async () => {
  await setupBackend();
})();

// Start WebSocket server
createWebSocketServer();