// The drive session's own connection to the running app's API.
//
// **Why the engine has one.** Its bus verbs used to travel through the page — `page.evaluateWith` into the
// renderer, the renderer's client to the API — and the answer came back the same way plus the in-page xstate
// inspector. Six process-boundary crossings for a database query, and the renderer a participant in a
// transaction it has nothing to do with: one value the window could not serialise killed its subscription and
// then every `/qx` timed out while `/eval` and `/state` kept answering, which read as a database fault. With
// its own socket the engine asks the API directly and is answered directly, and a broken window is just a
// broken window.
//
// **Zero dependencies, because none is needed.** Node has had a global `WebSocket` since 22 and this repo
// requires 23; `tests/e2e/app-integration/api-access.spec.ts` already opens an authenticated socket with
// `new WebSocket(url, ['abuddy', 'abuddy-token.<token>'])` and imports nothing. `@trpc/client` would cost 1.0M,
// 146 files and a `@trpc/server` peer in a package every pack's tests load; `ws` would be 192K of redundancy.
// What is left is tRPC's frames, which are below.
//
// **The frames, read out of `@trpc/server@11.16.0`'s installed adapter** (`dist/ws-*.mjs`, and
// `parseTRPCMessage`), not from memory — a hand-written protocol is the thing most likely to break on a bump, so
// the version it was read at is recorded here and `api-client.spec.ts` pins each shape:
//
// ```
// → { id, jsonrpc: '2.0', method: 'mutation',          params: { path: 'bus.claim', input: { as } } }
// → { id, jsonrpc: '2.0', method: 'subscription',      params: { path: 'bus.sub' } }
// → { id, jsonrpc: '2.0', method: 'subscription.stop' }                      // no params; cancels by id
// ← { id, jsonrpc, result: { type: 'started' } }                             // advisory, may follow data
// ← { id, jsonrpc, result: { type: 'data', data } }
// ← { id, jsonrpc, result: { type: 'stopped' } }
// ← { id, jsonrpc, error: { message, code, data: { code: 'CONFLICT', … } } }
// ```
//
// Three of those are a mistake away from a bug, so each is named: **success is `'result' in frame`, never
// `result.data`** — `bus.send` and `bus.claim` return nothing, so their success frame is
// `{"result":{"type":"data"}}` with no `data` at all. **`PING`/`PONG` are bare text, not JSON**, and must be
// skipped before parsing. And **an error is followed by `stopped`**, so a channel must not report twice.
//
// **No reconnection, deliberately.** A drive session is one run against one app launch. The socket can only die
// three ways: the app closed, so the session is over; the API crashed and was restarted on a possibly different
// port, so the claim died with the old process and the port we hold is stale; or the subscription itself failed
// while the socket lived. Only the second could be recovered, and doing so would re-fire `CLIENT_CONNECTED` to
// every system in the app. So the channel records why it is finished and every later verb fails saying so,
// which an agent can act on — rather than reconnecting into a session whose claim somebody else now holds.

/** A message on the app's bus, as `bus.sub` delivers it */
export interface BusMessage {
  readonly to: string;
  readonly event: { type: string;[key: string]: unknown };
  readonly from?: string;
  readonly via?: string;
  readonly sender?: string;
  readonly client?: string;
}

/** Where the API is and what it accepts. Resolved by the caller, so this module owns no app lifecycle. */
export interface ApiAddress {
  readonly port: number;
  readonly token: string;
  readonly host?: string;
}

export interface ApiClient {
  /** Takes a name on this connection, so a system can be told to answer it. Rejects when another holds it. */
  claim(ref: string): Promise<void>;
  /** Sends to a system. Rejects on a refusal, where the page route used to drop it silently. */
  send(message: { to: string; event: Record<string, unknown>; sender?: string }): Promise<void>;
  /** Every message the subscription delivers; returns the unsubscribe */
  onMessage(listener: (message: BusMessage) => void): () => void;
  /** Why the channel is finished, or null while it works. What a timed-out verb quotes instead of guessing. */
  readonly failure: string | null;
  close(): Promise<void>;
}

/** A frame the server sent */
type Frame = {
  id?: number | string | null;
  result?: { type: 'started' | 'data' | 'stopped'; data?: unknown };
  error?: { message?: string; data?: { code?: string } };
};

const SUBSCRIPTION_ID = 0;

/** What a refusal reads as, with the machine-readable code when there is one */
const refusal = (what: string, frame: Frame): Error =>
  new Error(`${what}: ${frame.error?.message ?? 'the API refused it'}${frame.error?.data?.code ? ` (${frame.error.data.code})` : ''}`);

/**
 * Opens the connection and sends its subscribe frame, resolving once the socket is open and that frame is away
 * — not once the subscription is live, which has no single answer. A refusal arrives later, through `failure`.
 *
 * Subscribing before returning is what orders it ahead of the claim: a reply addressed to a name on a
 * connection that is not yet listening would be delivered and dropped. The claim's lifetime needs no such
 * care, being released when the connection ends.
 */
export async function connectApiClient({ port, token, host = '127.0.0.1' }: ApiAddress): Promise<ApiClient> {
  const url = `ws://${host}:${port}`;
  // Both subprotocols: the server answers `abuddy` only when it is offered, and refuses without the token one
  const socket = new WebSocket(url, ['abuddy', `abuddy-token.${token}`]);

  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void; what: string }>();
  const listeners = new Set<(message: BusMessage) => void>();
  let nextId = SUBSCRIPTION_ID + 1;
  let failure: string | null = null;

  /** Finishes the channel once, failing whatever was in flight */
  const finish = (reason: string): void => {
    if (failure !== null) return;
    failure = reason;
    for (const { reject, what } of pending.values()) reject(new Error(`${what}: ${reason}`));
    pending.clear();
  };

  socket.addEventListener('message', (message: MessageEvent) => {
    const text = String(message.data);
    // The adapter's keep-alive words travel as bare text, not JSON.
    //
    // **Answering is the part that matters; skipping is tidiness.** `handleKeepAlive` schedules
    // `client.terminate()` once it has pinged and clears it on *any* message from us, so a session that only
    // listened would be dropped after `pongWaitMs`. Measured: removing the skip and removing the reply fail the
    // same case for the same reason — the `JSON.parse` below is already in a `try` that returns, so an unskipped
    // `PING` is swallowed rather than thrown, and either way no `PONG` goes back and the socket dies. The skip
    // only saves a pointless throw per tick and says what these two words are.
    //
    // The app sets no `keepAlive` today, which makes this latent — and silent if that ever changes.
    if (text === 'PING') {
      socket.send('PONG');
      return;
    }
    if (text === 'PONG') return;

    let frame: Frame;
    try {
      frame = JSON.parse(text) as Frame;
    } catch {
      return;
    }

    if (frame.id === SUBSCRIPTION_ID) {
      if (frame.error) finish(`the app refused the event subscription: ${frame.error.message ?? 'no reason given'}`);
      // An error is followed by `stopped`, so this must not overwrite the reason the error gave
      else if (frame.result?.type === 'stopped') finish('the app ended the event subscription');
      else if (frame.result?.type === 'data') for (const listener of listeners) listener(frame.result.data as BusMessage);
      return;
    }

    const waiting = typeof frame.id === 'number' ? pending.get(frame.id) : undefined;
    if (!waiting) return;
    pending.delete(frame.id as number);
    // Success is the presence of `result`, never of `result.data`: a procedure returning nothing sends
    // `{ result: { type: 'data' } }` with no data, and reading `data` would wait forever
    if (frame.error) waiting.reject(refusal(waiting.what, frame));
    else waiting.resolve(frame.result?.data);
  });

  const call = (method: 'mutation' | 'subscription', path: string, what: string, input?: unknown): Promise<unknown> => {
    if (failure !== null) return Promise.reject(new Error(`${what}: ${failure}`));
    const id = method === 'subscription' ? SUBSCRIPTION_ID : nextId++;
    const frame = { id, jsonrpc: '2.0', method, params: input === undefined ? { path } : { path, input } };
    return new Promise((resolve, reject) => {
      if (method !== 'subscription') pending.set(id, { resolve, reject, what });
      socket.send(JSON.stringify(frame));
      // A subscription has no single answer; `started` is advisory and may arrive after the first data frame,
      // so this resolves on the send and the channel reports a refusal through `failure` instead
      if (method === 'subscription') resolve(undefined);
    });
  };

  await new Promise<void>((resolve, reject) => {
    socket.addEventListener('open', () => resolve(), { once: true });
    socket.addEventListener('error', () => reject(new Error(
      `Couldn't reach the app's API at ${url}. The port and token come from the app window, so a failure here means the API restarted on another port or the app is gone.`,
    )), { once: true });
  });

  if (socket.protocol !== 'abuddy') {
    socket.close();
    throw new Error(`Something answered at ${url} that isn't this app's API: it accepted the connection but spoke "${socket.protocol}" instead of "abuddy"`);
  }

  socket.addEventListener('close', () => finish('the connection to the app closed'), { once: true });

  await call('subscription', 'bus.sub', 'subscribe');

  return {
    claim: (ref) => call('mutation', 'bus.claim', `claiming ${ref}`, { as: ref }).then(() => undefined),
    send: (message) => call('mutation', 'bus.send', `sending ${message.event.type} to ${message.to}`, message).then(() => undefined),
    onMessage: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    get failure() {
      return failure;
    },
    close: async () => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ id: SUBSCRIPTION_ID, jsonrpc: '2.0', method: 'subscription.stop' }));
      }
      finish('the drive session closed the connection');
      await new Promise<void>((resolve) => {
        if (socket.readyState === WebSocket.CLOSED) return resolve();
        socket.addEventListener('close', () => resolve(), { once: true });
        socket.close();
      });
    },
  };
}
