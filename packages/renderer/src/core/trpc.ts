// // In Electron, we use the preload-exposed tRPC client
// import { trpc } from '@app/preload';

// // Re-export for compatibility with existing code
// export { trpc };

import { createWSClient, wsLink, createTRPCClient } from '@trpc/client';
import type { AppRouter } from '@app/api';   // ← BE import Type‑only!

const ws = createWSClient({ url: import.meta.env.VITE_API_WS });
export const trpc = createTRPCClient<AppRouter>({
    links: [wsLink({ client: ws })],
});