import { createWSClient, wsLink, createTRPCProxyClient } from '@trpc/client';
import type { AppRouter } from '@abuddy/api';   // ← Type‑only!

const ws = createWSClient({ url: import.meta.env.VITE_API_WS });
export const trpc = createTRPCProxyClient<AppRouter>({
  links: [wsLink({ client: ws })],
});

/* Usage is now typed: */
const { sessionId } =
  await trpc.chat.openSession.mutate({ model: 'gpt-4o' });