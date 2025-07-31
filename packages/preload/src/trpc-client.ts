import { createTRPCClient, createWSClient, wsLink } from '@trpc/client';
import { ipcRenderer } from 'electron';

// Types (temporarily inline until shared package is set up)
type AppRouter = any; // Will be properly typed once API types are exposed

interface WsConnectionStatus {
  connected: boolean;
  reconnecting: boolean;
  lastError?: string;
  reconnectAttempts: number;
}

const API_SERVER_EVENTS = {
  STARTED: 'api:started',
  STOPPED: 'api:stopped',
  ERROR: 'api:error',
  RESTARTING: 'api:restarting',
  LOG: 'api:log',
} as const;


// Listen for API server events from main process
ipcRenderer.on(API_SERVER_EVENTS.STARTED, () => {
  console.log('[tRPC] API server started, connection will be re-established automatically');
  // WebSocket client will automatically reconnect
});

ipcRenderer.on(API_SERVER_EVENTS.STOPPED, () => {
  console.log('[tRPC] API server stopped');

});

ipcRenderer.on(API_SERVER_EVENTS.RESTARTING, (_, data) => {
  console.log(`[tRPC] API server restarting (${data.attempt}/${data.maxAttempts})`);
});