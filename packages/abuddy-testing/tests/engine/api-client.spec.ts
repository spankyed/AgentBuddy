// The wire protocol, against the server that actually speaks it.
//
// `api-client.ts` writes tRPC's frames by hand, which is the riskiest thing in the drive engine: a fake socket
// would only re-assert my own reading of them, and `session.spec.ts`'s `fakeApi` fakes the *interface* rather
// than the protocol. So every case here runs a real `applyWSSHandler` over a real `WebSocketServer` on an
// ephemeral port, with a local router standing in for `bus.*`. If a frame shape is wrong, or a tRPC bump
// changes one, these fail — which nothing else in the repo would.
//
// Three of the shapes are a single mistake away from a hang rather than an error, and each has a case for
// exactly that reason: success is the presence of `result` and never of `result.data`; `PING`/`PONG` are bare
// text and not JSON; and an error is *followed* by `stopped`, so a channel must not finish twice.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as http from 'node:http';
import { WebSocketServer } from 'ws';
import { initTRPC, TRPCError } from '@trpc/server';
import { applyWSSHandler } from '@trpc/server/adapters/ws';
import { observable } from '@trpc/server/observable';
import { connectApiClient, type ApiClient, type BusMessage } from '../../src/engine/api-client.ts';

const TOKEN = 'a-test-token';

/** How the router behaves, set per case before the client connects */
let behaviour: {
  claimRefuses?: boolean;
  emit?: unknown[];
  completeSubscription?: boolean;
} = {};

/** The subprotocols the server was offered, so the handshake can be asserted rather than assumed */
let offered: string | undefined;

const t = initTRPC.create();
const router = t.router({
  bus: t.router({
    // Returns nothing, exactly as the real `bus.claim` and `bus.send` do: the success frame carries no `data`
    claim: t.procedure.mutation(() => {
      if (behaviour.claimRefuses) {
        throw new TRPCError({ code: 'CONFLICT', message: '"host/drive" is already claimed by another connection.' });
      }
    }),
    send: t.procedure.mutation(() => {}),
    sub: t.procedure.subscription(() => observable<unknown>((emit) => {
      for (const message of behaviour.emit ?? []) emit.next(message);
      if (behaviour.completeSubscription) emit.complete();
      return () => {};
    })),
  }),
});

let server: http.Server;
let wss: WebSocketServer;
let port: number;
let client: ApiClient | undefined;

/** Starts the server. `keepAlive` is off unless a case asks, since it would terminate an idle socket. */
async function serve(keepAlive?: { enabled: true; pingMs: number; pongWaitMs: number }): Promise<void> {
  server = http.createServer();
  wss = new WebSocketServer({
    server,
    // The app's own handshake: the token rides as a subprotocol, and `abuddy` is answered only when offered
    verifyClient: ({ req }: { req: http.IncomingMessage }) => {
      offered = req.headers['sec-websocket-protocol'];
      return (offered ?? '').includes(`abuddy-token.${TOKEN}`);
    },
    handleProtocols: (protocols: Set<string>) => (protocols.has('abuddy') ? 'abuddy' : false),
  });
  applyWSSHandler({ wss, router, createContext: () => ({}), ...(keepAlive ? { keepAlive } : {}) });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as { port: number }).port;
}

const connect = () => connectApiClient({ port, token: TOKEN });
const after = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

beforeEach(() => {
  behaviour = {};
  offered = undefined;
  client = undefined;
});

afterEach(async () => {
  await client?.close();
  wss?.close();
  await new Promise<void>((resolve) => server?.close(() => resolve()) ?? resolve());
});

describe('the handshake', () => {
  it('offers the app protocol and the token, in that order', async () => {
    await serve();
    client = await connect();

    expect(offered, 'the server answers `abuddy` only when it is offered, and refuses without the token')
      .toBe(`abuddy, abuddy-token.${TOKEN}`);
  });

  it('refuses a connection the server will not accept', async () => {
    await serve();

    await expect(connectApiClient({ port, token: 'the-wrong-token' }))
      .rejects.toThrow(/Couldn't reach the app's API/);
  });
});

describe('a call that returns nothing', () => {
  /**
   * The hang this prevents. `bus.claim` and `bus.send` return `undefined`, so their success frame is
   * `{"result":{"type":"data"}}` — with no `data` key at all. A client reading `result.data` to decide success
   * waits for ever on a call the server already answered.
   */
  it('resolves on the presence of `result`, not of `result.data`', async () => {
    await serve();
    client = await connect();

    await expect(client.claim('host/drive')).resolves.toBeUndefined();
    await expect(client.send({ to: 'default-setup/database', event: { type: 'PING' } })).resolves.toBeUndefined();
  });

  /**
   * The `connectionParams` trap, as behaviour rather than as a URL assertion.
   *
   * Adding `?connectionParams=1` without then sending a params frame makes the adapter consume the *first*
   * operation frame as those params and drop it — the call hangs with no error at all. A mutation answered
   * immediately after connecting is what says that did not happen.
   */
  it('has its first call answered, so nothing was swallowed on connect', async () => {
    await serve();
    client = await connect();

    await expect(client.claim('host/drive')).resolves.toBeUndefined();
  });
});

describe('a refusal', () => {
  it('rejects with the reason and the code, not a generic failure', async () => {
    behaviour.claimRefuses = true;
    await serve();
    client = await connect();

    await expect(client.claim('host/drive')).rejects.toThrow(/already claimed by another connection/);
    await expect(client.claim('host/drive'), 'and the machine-readable code, for a caller that branches')
      .rejects.toThrow(/CONFLICT/);
  });

  // A refusal is one call's failure, not the channel's: the next call must still work
  it('leaves the channel usable', async () => {
    behaviour.claimRefuses = true;
    await serve();
    client = await connect();

    await expect(client.claim('host/drive')).rejects.toThrow();
    expect(client.failure, 'the connection is fine; one call was refused').toBeNull();
    await expect(client.send({ to: 'x/y', event: { type: 'PING' } })).resolves.toBeUndefined();
  });
});

describe('the subscription', () => {
  it('delivers a message to its listeners', async () => {
    const sent: BusMessage = { to: 'host/drive', event: { type: 'QUERY_RESULT', result: 7 }, sender: 'default-setup/database' };
    behaviour.emit = [sent];
    await serve();

    const seen: BusMessage[] = [];
    client = await connect();
    client.onMessage((message) => { seen.push(message); });
    await after(50);

    expect(seen).toEqual([sent]);
  });

  /**
   * When the server ends the stream, the channel is finished and says so once.
   *
   * `failure` is what a timed-out round-trip quotes instead of listing maybes, so it must be set — and an
   * error frame is *followed* by a `stopped` frame, which is why finishing has to be idempotent.
   */
  it('finishes the channel when the server stops it, and reports it once', async () => {
    behaviour.completeSubscription = true;
    await serve();
    client = await connect();
    await after(50);

    expect(client.failure, 'the reason a later verb will quote').toMatch(/ended the event subscription/);
    await expect(client.send({ to: 'x/y', event: { type: 'PING' } })).rejects.toThrow(/ended the event subscription/);
  });
});

describe('keep-alive', () => {
  /**
   * A real `PING` from the adapter, not a fake one.
   *
   * `handleKeepAlive` sends `PING` and then schedules `client.terminate()`, cleared by *any* message from us.
   * So skipping `PING` without answering is not merely untidy: an idle session is dropped after `pongWaitMs`.
   * The app sets no `keepAlive` today, which makes this latent — and would make it silent.
   */
  it('survives a ping cycle and keeps answering', async () => {
    await serve({ enabled: true, pingMs: 15, pongWaitMs: 60 });
    client = await connect();

    // Long enough for several ping/terminate windows to come and go while the client sits idle
    await after(200);

    expect(client.failure, 'the socket was not terminated under us').toBeNull();
    await expect(client.send({ to: 'x/y', event: { type: 'PING' } })).resolves.toBeUndefined();
  });
});
