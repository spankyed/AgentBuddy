import { createWSClient, wsLink, createTRPCClient, type TRPCClient } from '@trpc/client';
import type { AppRouter } from '@app/api';   // ← BE import Type‑only!

type ApiClient = TRPCClient<AppRouter>;

/** The port this window launched with. The API can move after a restart — see reconnectApiClient. */
const initialPort = (typeof window !== 'undefined' && window.electronAPI?.apiPort) || 3001;

function connect(port: number) {
  const ws = createWSClient({ url: `ws://127.0.0.1:${port}` });
  return { port, ws, client: createTRPCClient<AppRouter>({ links: [wsLink({ client: ws })] }) };
}

let connection = connect(initialPort);

/**
 * The API client. A proxy, because the client is rebuilt when the API restarts on a different
 * port: importers hold this binding for the window's lifetime, so every call has to reach
 * whichever client is current.
 */
export const trpc: ApiClient = new Proxy({} as ApiClient, {
  get: (_, prop) => connection.client[prop as keyof ApiClient],
});

/**
 * Points the client at `port`, closing the old socket. Returns false when the port is unchanged,
 * so a caller can leave a working connection — and its subscriptions — alone.
 */
export function reconnectApiClient(port: number): boolean {
  if (port === connection.port) return false;
  console.info(`[trpc] API moved to port ${port}; reconnecting`);
  connection.ws.close();
  connection = connect(port);
  return true;
}
