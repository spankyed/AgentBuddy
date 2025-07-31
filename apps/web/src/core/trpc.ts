import { createWSClient, wsLink, createTRPCClient } from '@trpc/client';
import type { AppRouter } from '@abuddy/api';   // ← BE import Type‑only!

// Use dynamic backend URL in Electron, fallback to env variable
const getBackendUrl = () => {
  if (typeof window !== 'undefined' && (window as any).__BACKEND_URL__) {
    return (window as any).__BACKEND_URL__;
  }
  return import.meta.env.VITE_API_WS || 'ws://localhost:3001';
};

// Lazy initialization to avoid circular dependencies
let _trpc: ReturnType<typeof createTRPCClient<AppRouter>> | null = null;
let _ws: ReturnType<typeof createWSClient> | null = null;

function initializeTRPC() {
  if (!_trpc) {
    _ws = createWSClient({ url: getBackendUrl() });
    _trpc = createTRPCClient<AppRouter>({
      links: [wsLink({ client: _ws })],
    });
  }
  return _trpc;
}

// Export a getter that initializes on first use
export const trpc: ReturnType<typeof createTRPCClient<AppRouter>> = new Proxy({} as any, {
  get(target, prop) {
    const client = initializeTRPC();
    return client[prop as keyof typeof client];
  },
  apply(target, thisArg, argArray) {
    const client = initializeTRPC();
    return Reflect.apply(client as any, thisArg, argArray);
  }
});