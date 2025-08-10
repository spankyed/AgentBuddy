import 'dotenv/config';
import { setupBackend } from './setup/backend';
import { createWebSocketServer } from './setup/websocket';

// Initialize backend systems
(async () => {
  await setupBackend();
})();

// Start WebSocket server
createWebSocketServer();