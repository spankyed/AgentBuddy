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

export const createContext = () => ({ client: randomId({ prefix: 'c-' }) });

export type Context = ReturnType<typeof createContext>;
