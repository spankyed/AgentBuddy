import { createWSClient, wsLink, createTRPCClient } from '@trpc/client';
import type { AppRouter } from '@abuddy/api';   // ← BE import Type‑only!

// Use dynamic backend URL in Electron, fallback to env variable
const getBackendUrl = () => {
  if (typeof window !== 'undefined' && (window as any).__BACKEND_URL__) {
    return (window as any).__BACKEND_URL__;
  }
  return import.meta.env.VITE_API_WS || 'ws://localhost:3001';
};

const ws = createWSClient({ url: getBackendUrl() });
export const trpc = createTRPCClient<AppRouter>({
  links: [wsLink({ client: ws })],
});