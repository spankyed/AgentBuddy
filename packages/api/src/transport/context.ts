// The context every tRPC call gets: which connection it came in on, and nothing else — what a procedure
// needs besides that, it takes from the bound app.
//
// `client` is what makes a reply addressable to one window instead of all of them. The WebSocket adapter
// calls this once per connection and every operation on that socket awaits the same result
// (`getWSConnectionHandler`, @trpc/server), so an id minted here is per-connection by construction; it is
// not derived from the socket, only from when this runs. Two properties follow, and both are load-bearing:
// it is never read from the wire, so a return address cannot be forged, and it dies with the socket, so
// nothing has to observe a disconnect to retire it.
import { randomId } from '@abuddy/sdk/utils/pure';

/**
 * What the WebSocket adapter hands this, narrowed to the one member used. The adapter aborts this signal from
 * `client.once('close')`, so it is the connection ending rather than any one call being cancelled.
 */
type ConnectionArgs = { info?: { signal?: AbortSignal } };

export const createContext = ({ info }: ConnectionArgs = {}) => ({
  client: randomId({ prefix: 'c-' }),
  /**
   * Fires when this connection ends, whatever ended it. Anything holding per-connection state releases it here.
   *
   * It matters that this is the *connection* and not a subscription. Releasing from a subscription's teardown is
   * both too eager — a client that stops subscribing while keeping its socket would lose its name — and too
   * narrow, since one that claims without ever subscribing would hold the name until the process exited.
   */
  closed: info?.signal,
});

export type Context = ReturnType<typeof createContext>;
