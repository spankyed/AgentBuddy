// The context is one connection's identity, and two things have to hold: it is different per connection, and
// the signal it carries actually arrives and fires when the socket closes.
//
// The first is checked by calling `createContext` directly. The second cannot be — handing it a signal and
// then asserting the signal is there proves nothing about the adapter, which is the only thing that supplies
// one in production. So the last case runs a real `applyWSSHandler` over a real socket with this module's own
// `createContext`, for `encoder.spec.ts`'s reason: the failure is silent. Every participant claim is released
// from `ctx.closed` (`bus.ts`), so a tRPC bump that stopped passing `info.signal` would leak every claim for
// the life of the process and no unit test would notice.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as http from 'node:http';
import { WebSocketServer } from 'ws';
import { initTRPC } from '@trpc/server';
import { applyWSSHandler } from '@trpc/server/adapters/ws';
import { createContext, type Context } from '@/transport/context';

/** A connection as the adapter describes one, which is the only shape `createContext` accepts */
const connection = () => ({ info: { signal: new AbortController().signal } });

describe('createContext', () => {
  it('names the connection', () => {
    expect(createContext(connection()).client).toMatch(/^c-/);
  });

  /**
   * The case that matters, and the one a constant minter fails. Two connections sharing an id would make every
   * reply go to whichever of them asked last, which is the bug this whole mechanism exists to prevent — and it
   * would look like it worked for as long as only one window was open.
   */
  it('gives every connection a different name', () => {
    const ids = Array.from({ length: 50 }, () => createContext(connection()).client);
    expect(new Set(ids).size, 'no two connections share an id').toBe(ids.length);
  });
});

/**
 * What the adapter hands `createContext`, asserted through the adapter.
 *
 * The router is a local one so nothing boots — what is under test is the seam, not the app. The procedure
 * reports the context it was given and arms a listener on it, so one call answers both halves: the signal is
 * there, and it fires on close rather than on the call ending.
 */
describe('the connection signal the adapter supplies', () => {
  let server: http.Server;
  let wss: WebSocketServer;
  let port: number;
  /** Set by the procedure, so a case can read what the adapter gave it after the socket is gone */
  let seen: { hasSignal: boolean; aborted: boolean } | undefined;

  const t = initTRPC.context<Context>().create();
  const router = t.router({
    look: t.procedure.query(({ ctx }) => {
      const record = { hasSignal: ctx.closed instanceof AbortSignal, aborted: false };
      ctx.closed.addEventListener('abort', () => { record.aborted = true; }, { once: true });
      seen = record;
      return { client: ctx.client };
    }),
  });

  beforeEach(async () => {
    seen = undefined;
    server = http.createServer();
    wss = new WebSocketServer({ server });
    // This module's own createContext, which is the point: a stub would assert nothing about the adapter
    applyWSSHandler({ wss, router, createContext });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as { port: number }).port;
  });

  afterEach(async () => {
    wss.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  /** Opens a socket, makes one query, closes it, and gives the server a turn to notice */
  async function askThenClose(): Promise<void> {
    const socket = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener('open', () => resolve(), { once: true });
      socket.addEventListener('error', () => reject(new Error('the socket would not open')), { once: true });
    });
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener('message', () => resolve(), { once: true });
      socket.addEventListener('close', () => reject(new Error('the socket closed before answering')), { once: true });
      socket.send(JSON.stringify({ id: 1, jsonrpc: '2.0', method: 'query', params: { path: 'look' } }));
    });
    socket.close();
    // `client.once('close')` fires a turn after the client's close, so the abort is not synchronous with it
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
  }

  it('is there, and ends with the connection', async () => {
    await askThenClose();

    expect(seen?.hasSignal, 'the adapter passed info.signal, which `closed` is not optional about').toBe(true);
    expect(seen?.aborted, 'and it fired when the socket closed, which is what releases a claim').toBe(true);
  });
});
