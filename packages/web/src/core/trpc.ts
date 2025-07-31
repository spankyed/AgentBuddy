import { createWSClient, wsLink, createTRPCClient } from '@trpc/client';
import type { AppRouter } from '@abuddy/api';   // ← BE import Type‑only!

const ws = createWSClient({ url: import.meta.env.VITE_API_WS });
export const trpc = createTRPCClient<AppRouter>({
  links: [wsLink({ client: ws })],
});