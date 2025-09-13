// // In Electron, we use the preload-exposed tRPC client
// import { trpc } from '@app/preload';

// // Re-export for compatibility with existing code
// export { trpc };

import { createWSClient, wsLink, createTRPCClient } from '@trpc/client';
import type { AppRouter } from '@app/api';   // ← BE import Type‑only!

// Get the API port from the preload-exposed value or fall back to default
const getApiPort = (): number => {
  if (typeof window !== 'undefined' && window.electronAPI?.apiPort) {
    return window.electronAPI.apiPort;
  }
  // Fallback for development or if preload fails
  return 3001;
};

const apiPort = getApiPort();
const wsUrl = `ws://localhost:${apiPort}`;

const ws = createWSClient({ url: wsUrl });
export const trpc = createTRPCClient<AppRouter>({
    links: [wsLink({ client: ws })],
});