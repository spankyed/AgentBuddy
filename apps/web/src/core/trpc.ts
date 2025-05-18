import { createWSClient, wsLink, createTRPCClient } from '@trpc/client';
import type { AppRouter } from '@abuddy/api';   // ← Type‑only!

// const ws = createWSClient({ url: import.meta.env.VITE_API_WS });
const ws = createWSClient({ url: 'ws://localhost:3001/trpc' });
export const trpc = createTRPCClient<AppRouter>({
  links: [wsLink({ client: ws })],
});