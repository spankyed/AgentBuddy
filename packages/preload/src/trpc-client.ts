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

// WebSocket client configuration
const wsClient = createWSClient({
  url: 'ws://localhost:3001/trpc',

  // Connection event handlers
  onOpen: () => {
    console.log('[tRPC] WebSocket connected');
    updateConnectionStatus({
      connected: true,
      reconnecting: false,
      reconnectAttempts: 0
    });
  },

  onClose: () => {
    console.log('[tRPC] WebSocket disconnected');
    updateConnectionStatus({
      connected: false,
      reconnecting: true
    });
  },
});

// Connection status tracking
let connectionStatus: WsConnectionStatus = {
  connected: false,
  reconnecting: false,
  reconnectAttempts: 0,
};

function updateConnectionStatus(update: Partial<WsConnectionStatus>) {
  connectionStatus = { ...connectionStatus, ...update };

  // Notify renderer about connection status changes
  // This would be consumed by Vue components to show connection state
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('trpc-connection-status', {
      detail: connectionStatus
    }));
  }
}

// Create tRPC client with typed router
export const trpc = createTRPCClient<AppRouter>({
  links: [
    wsLink({
      client: wsClient,
    }),
  ],
});

// Export connection status getter
export function getConnectionStatus(): WsConnectionStatus {
  return { ...connectionStatus };
}

// Listen for API server events from main process
ipcRenderer.on(API_SERVER_EVENTS.STARTED, () => {
  console.log('[tRPC] API server started, connection will be re-established automatically');
  // WebSocket client will automatically reconnect
});

ipcRenderer.on(API_SERVER_EVENTS.STOPPED, () => {
  console.log('[tRPC] API server stopped');
  updateConnectionStatus({
    connected: false,
    reconnecting: false
  });
});

ipcRenderer.on(API_SERVER_EVENTS.RESTARTING, (_, data) => {
  console.log(`[tRPC] API server restarting (${data.attempt}/${data.maxAttempts})`);
  updateConnectionStatus({
    reconnecting: true,
    reconnectAttempts: data.attempt
  });
});