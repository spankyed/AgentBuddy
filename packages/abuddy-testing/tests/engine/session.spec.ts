// The protocol a live drive session speaks, against a fake page. What is checked here is that every verb
// answers rather than throws, and that the two things the real app would make expensive to discover —
// a result that cannot cross the process boundary, and two bus round-trips sharing a reply with no
// request id — are handled before anything launches Electron.
import { describe, expect, it, vi } from 'vitest';
import {
  BRIDGE_FLAG, BRIDGE_FUNCTION, createSession, DATABASE_SYSTEM, DRIVE_REF, evalSource, MAX_SEEN_EVENTS,
  REPLY_TIMEOUT_MS, type SeenEvent, type SessionApi, type SessionPage,
} from '../../src/engine/session.ts';
import type { BusMessage } from '../../src/engine/api-client.ts';

/** A page that records what it was asked and lets a test answer for it, plus the bridge's own callback */
function fakePage() {
  let emit: ((payload: unknown) => void) | undefined;
  const expressions: string[] = [];
  const evaluateExpression = vi.fn(async (source: string): Promise<unknown> => {
    expressions.push(source);
    return null;
  });
  const evaluateWith = vi.fn(async (fn: (arg: never) => unknown, arg: unknown): Promise<unknown> => {
    void fn;
    void arg;
    return null;
  });
  const page: SessionPage = {
    evaluateExpression,
    evaluateWith: evaluateWith as SessionPage['evaluateWith'],
    exposeFunction: vi.fn(async (name: string, callback: (payload: unknown) => void) => {
      expect(name, 'the page is given the exported name, not a copy of it').toBe(BRIDGE_FUNCTION);
      emit = callback;
    }),
    screenshot: vi.fn(async () => Buffer.from('')),
    waitForState: vi.fn(async () => undefined),
    waitForPlugin: vi.fn(async () => undefined),
  };
  return {
    page, expressions, evaluateExpression, evaluateWith,
    waitForState: page.waitForState as ReturnType<typeof vi.fn>,
    waitForPlugin: page.waitForPlugin as ReturnType<typeof vi.fn>,
    emit: (event: SeenEvent) => emit?.(event),
  };
}

/**
 * A connection that records what it was asked to send and lets a test answer for it.
 *
 * The bus verbs travel over this now rather than through the page, so this is where a round-trip's send is
 * asserted and where its reply comes from. `finish` sets `failure` *and* tells the listeners, as the real
 * client does — the point of `onFinished` being that the state is announced rather than only readable.
 */
function fakeApi() {
  let deliver: ((message: BusMessage) => void) | undefined;
  const finishListeners = new Set<(reason: string) => void>();
  const send = vi.fn(async (_message: { to: string; event: Record<string, unknown>; sender?: string }) => {});
  let failure: string | null = null;
  const api: SessionApi = {
    send,
    onMessage: (listener) => { deliver = listener; return () => { deliver = undefined; }; },
    onFinished: (listener) => { finishListeners.add(listener); return () => finishListeners.delete(listener); },
    get failure() { return failure; },
  };
  return {
    api,
    send,
    /** The channel finishing, as the client reports it: the state, then everyone who asked to be told */
    finish: (reason: string) => {
      failure = reason;
      for (const listener of finishListeners) listener(reason);
    },
    /** Only the state, for the case about a round-trip armed after the channel had already gone */
    fail: (reason: string) => { failure = reason; },
    /** What the app answered on the session's own connection */
    answer: (event: Record<string, unknown> & { type: string }, to = DRIVE_REF) =>
      deliver?.({ to, event, sender: DATABASE_SYSTEM }),
  };
}

const sessionWith = (overrides: Partial<SessionPage> = {}) => {
  const fake = fakePage();
  const client = fakeApi();
  const errors = ['renderer blew up'];
  const session = createSession({
    page: { ...fake.page, ...overrides },
    api: client.api,
    takeErrors: () => errors.splice(0, errors.length),
  });
  return { ...fake, ...client, session };
};

/**
 * The envelope the connection was last asked to send, or a failure that says nothing was sent.
 *
 * Reading straight off `calls.at(-1)?.[0]` throws an opaque `TypeError` when no send happened, which is the
 * likeliest thing to go wrong in a test about sends — so it is named here instead.
 */
const lastSend = (calls: { mock: { calls: unknown[][] } }): { to: string; event: Record<string, unknown>; sender?: string } => {
  const call = calls.mock.calls.at(-1);
  if (call === undefined) throw new Error('nothing was sent over the connection');
  return call[0] as { to: string; event: Record<string, unknown>; sender?: string };
};

/** Lets the microtasks a verb queues run, without waiting on any real timer */
const settle = () => new Promise((resolve) => setImmediate(resolve));

/** `drainEvents` answers with the batch and what it had to drop */
const drained = (result: { ok: boolean; value?: unknown }) =>
  (result as { value: { events: SeenEvent[]; dropped: number } }).value;

describe('a verb always answers', () => {
  it('reports a value as ok', async () => {
    const { session } = sessionWith({ evaluateExpression: async () => ({ cloneable: true, value: 7 }) });
    await expect(session.evaluate('return 7')).resolves.toEqual({ ok: true, value: 7 });
  });

  /**
   * A throw would be a 500 and the agent would learn only that something went wrong. The verb's name is
   * in the message because a bare `Error.message` does not say which call produced it.
   */
  it('reports a throw as ok false, naming the verb', async () => {
    const { session } = sessionWith({
      evaluateExpression: async () => { throw new Error('page is gone'); },
    });
    const result = await session.evaluate('return 1');

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ error: 'eval: page is gone' });
  });

  it('reports a non-Error throw too, rather than losing it', async () => {
    const { session } = sessionWith({
      evaluateExpression: async () => { throw 'just a string'; },
    });
    await expect(session.evaluate('return 1')).resolves.toEqual({ ok: false, error: 'eval: just a string' });
  });
});

/**
 * The case that would otherwise cost an agent a confusing Playwright failure.
 *
 * `page.evaluate` returns only structured-cloneable values, and the first thing anyone asks for is the
 * state machine — which carries actor refs and functions. The clone is attempted in the page so the
 * answer is a description and an instruction, not a dropped request.
 */
describe('a result that cannot cross the boundary', () => {
  it('is described, with the keys and what to do instead', async () => {
    const { session } = sessionWith({
      evaluateExpression: async () => ({
        cloneable: false, described: '[object Object]', keys: ['send', 'getSnapshot'],
      }),
    });
    const result = await session.evaluate('return window.applicationState');

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ error: expect.stringContaining('not serialisable') });
    expect(result).toMatchObject({ error: expect.stringContaining('send, getSnapshot') });
    expect(result, 'and says how to ask for it').toMatchObject({
      error: expect.stringContaining('JSON.stringify'),
    });
  });

  it('leaves out the key list when there is none', async () => {
    const { session } = sessionWith({
      evaluateExpression: async () => ({ cloneable: false, described: '[object Function]', keys: [] }),
    });
    const result = await session.evaluate('return () => 1');

    expect(result).toMatchObject({ error: expect.stringContaining('[object Function])') });
    expect(result).not.toMatchObject({ error: expect.stringContaining('keys:') });
  });

  it('wraps the body as a call rather than splicing it into an expression', () => {
    // The body is a function body — `return` has to be legal in it, which an expression wrapper breaks
    expect(evalSource('return 1')).toContain('return 1');
    expect(evalSource('return 1')).toContain('structuredClone');
  });
});

describe('the in-page bridge', () => {
  it('installs the collector behind a flag, so a reconnect does not double it', async () => {
    const { session, expressions } = sessionWith();
    await session.ready();

    const installed = expressions.find((source) => source.includes(BRIDGE_FLAG));
    expect(installed, 'the flag guards the install').toContain(`if (win.${BRIDGE_FLAG}) return null;`);
    expect(installed).toContain(BRIDGE_FUNCTION);
  });

  it('collects what the page emits, and a drain empties it', async () => {
    const { session, emit } = sessionWith();
    await session.ready();

    emit({ type: 'QUERY_RESULT', event: { result: 1 } });
    emit({ type: 'SOMETHING_ELSE', event: {} });

    expect(drained(session.drainEvents()).events.map((e) => e.type))
      .toEqual(['QUERY_RESULT', 'SOMETHING_ELSE']);
    expect(drained(session.drainEvents()).events, 'read and cleared').toEqual([]);
  });

  /**
   * The inspector sees all of the app's traffic, not only replies, so a session nobody drains would
   * grow for as long as it is open. The oldest go, and the count of them is reported.
   */
  it('caps the buffer, keeps the newest and says how many it dropped', async () => {
    const { session, emit } = sessionWith();
    await session.ready();

    for (let n = 0; n < MAX_SEEN_EVENTS + 5; n += 1) emit({ type: `E${n}`, event: {} });
    const first = drained(session.drainEvents());

    expect(first.events).toHaveLength(MAX_SEEN_EVENTS);
    expect(first.events[0]?.type, 'the oldest five went').toBe('E5');
    expect(first.events.at(-1)?.type, 'the newest stayed').toBe(`E${MAX_SEEN_EVENTS + 4}`);
    expect(first.dropped).toBe(5);
    expect(drained(session.drainEvents()).dropped, 'the count resets with the read').toBe(0);
  });

  it('still wakes a waiter when the buffer is full', async () => {
    const { session, emit, send } = sessionWith();
    await session.ready();

    for (let n = 0; n < MAX_SEEN_EVENTS; n += 1) emit({ type: `E${n}`, event: {} });
    const pending = session.qx('return 1');
    await settle();
    const requestId = String(lastSend(send).event.requestId);
    // A reply arriving into a full buffer must still resolve the request waiting for it
    emit({ type: 'QUERY_RESULT', event: { result: 'through a full buffer', requestId } });

    await expect(pending).resolves.toEqual({ ok: true, value: 'through a full buffer' });
  });
});

/**
 * `/qx` and `/tx` go to the system that already runs code against the live engine, and each reply names
 * the request it answers — so the engine takes its own and leaves everything else alone.
 *
 * It used to run one round-trip at a time instead, because the reply named nothing and the next one of
 * the right type therefore had to be this request's. That held only while nothing was abandoned, which
 * is the case the last two tests here are about.
 */
describe('a bus round-trip', () => {
  /** The id the engine minted, read back off the send so a test can answer as the app would */
  const sentId = (calls: { mock: { calls: unknown[][] } }): string =>
    String(lastSend(calls).event.requestId);

  it('sends to the database system with an id, and resolves on the reply that carries it', async () => {
    const { session, send, answer } = sessionWith();
    await session.ready();

    const pending = session.qx('return 42');
    await settle();
    const sent = lastSend(send);
    expect(sent.to).toBe(DATABASE_SYSTEM);
    expect(sent.event).toMatchObject({ type: 'EXECUTE_QUERY', code: 'return 42' });
    expect(sent.event.requestId, 'minted by the requester, not the replier').toEqual(expect.any(String));
    // The field the system turns into a reply address: without it `reply` has nobody to answer
    expect(sent.sender, 'so the system can answer this session').toBe(DRIVE_REF);

    answer({ type: 'QUERY_RESULT', result: 42, requestId: sentId(send) });
    await expect(pending).resolves.toEqual({ ok: true, value: 42 });
  });

  it('turns the error reply into ok false, carrying the system message', async () => {
    const { session, send, answer } = sessionWith();
    await session.ready();

    const pending = session.qx('return boom');
    await settle();
    answer({ type: 'QUERY_ERROR', error: 'boom is not defined', requestId: sentId(send) });

    await expect(pending).resolves.toEqual({ ok: false, error: 'qx: boom is not defined' });
  });

  it('uses the transaction events for tx, not the query ones', async () => {
    const { session, send, answer } = sessionWith();
    await session.ready();

    const pending = session.tx('return tx(...)');
    await settle();
    expect(lastSend(send).event).toMatchObject({ type: 'EXECUTE_TRANSACTION', code: 'return tx(...)' });

    const requestId = sentId(send);
    // A QUERY_RESULT carrying the same id must not satisfy a transaction either: the type and the id
    // are both part of the answer, and only one of them is enough to be wrong
    answer({ type: 'QUERY_RESULT', result: 'wrong', requestId });
    answer({ type: 'TRANSACTION_RESULT', result: 'right', requestId });
    await expect(pending).resolves.toEqual({ ok: true, value: 'right' });
  });

  /**
   * The bridge is still a reply path, and this is the only case that says so.
   *
   * An app built before `host/drive` existed answers with a broadcast, which never reaches this session's
   * connection — the in-page inspector is the only way to see it. `abuddy drive --app beta` can be exactly that
   * app, so waiters hear both channels and this case is what stops the page path being deleted as redundant.
   */
  it('still resolves a round-trip from a reply seen only in the page', async () => {
    const { session, emit, send } = sessionWith();
    await session.ready();

    const pending = session.qx('return 1');
    await settle();
    emit({ type: 'QUERY_RESULT', event: { result: 'through the bridge', requestId: sentId(send) } });

    await expect(pending).resolves.toEqual({ ok: true, value: 'through the bridge' });
  });

  /**
   * The channel dying ends what is waiting on it, at once.
   *
   * It used to end at `REPLY_TIMEOUT_MS` instead: `failure` was a state nothing announced, so a round-trip
   * could only discover it by being asked, and an agent sat fifteen seconds for a sentence that was true
   * immediately. The real client tells its listeners from the same place it records the state
   * (`ApiClient.onFinished`).
   */
  it('ends a round-trip in flight as soon as the channel finishes', async () => {
    const { session, finish } = sessionWith();
    await session.ready();

    const pending = session.qx('return 1');
    await settle();
    finish('the app closed the connection');

    await expect(pending).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining('the app closed the connection'),
    });
  });

  // And one armed after it has gone needs no wait at all: there is nothing to wait for
  it('refuses a round-trip started once the channel has finished', async () => {
    const { session, fail } = sessionWith();
    await session.ready();
    fail('the app closed the connection');

    await expect(session.qx('return 1')).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining('restart the session'),
    });
  });

  /** Someone else's query — a person in the Database plugin while a session drives */
  it('ignores a reply for a request it did not make', async () => {
    const { session, send, answer } = sessionWith();
    await session.ready();

    const pending = session.qx('return mine');
    await settle();
    answer({ type: 'QUERY_RESULT', result: 'someone else', requestId: 'q-elsewhere' });
    await settle();

    answer({ type: 'QUERY_RESULT', result: 'mine', requestId: sentId(send) });
    await expect(pending).resolves.toEqual({ ok: true, value: 'mine' });
  });

  /**
   * The defect this whole change exists for, and it could not be written before.
   *
   * A request is abandoned at the timeout; its answer arrives afterwards, when the next request is the
   * one waiting. With no id in the reply the next request took it and reported it as its own. Now the
   * orphan matches nobody.
   */
  it('does not give an abandoned request\'s late reply to the next one', async () => {
    vi.useFakeTimers();
    try {
      const { session, send, answer } = sessionWith();
      await session.ready();

      const abandoned = session.qx('return slow');
      await vi.advanceTimersByTimeAsync(0);
      const orphanId = sentId(send);
      await vi.advanceTimersByTimeAsync(REPLY_TIMEOUT_MS + 10);
      await expect(abandoned).resolves.toMatchObject({ ok: false });

      const next = session.qx('return quick');
      await vi.advanceTimersByTimeAsync(0);
      // The slow query finishes at last, with nobody waiting for it
      answer({ type: 'QUERY_RESULT', result: 'the abandoned one', requestId: orphanId });
      await vi.advanceTimersByTimeAsync(0);

      answer({ type: 'QUERY_RESULT', result: 'its own', requestId: sentId(send) });
      await expect(next).resolves.toEqual({ ok: true, value: 'its own' });
    } finally {
      vi.useRealTimers();
    }
  });

  /**
   * The causes changed when the send stopped going through the page, and the message had to change with them.
   *
   * It used to lead with a serialisation failure in the *renderer's* subscription, because that killed every
   * later round-trip. It cannot any more — this session has its own connection — so that cause is gone from here
   * entirely rather than demoted.
   */
  it('names what is left to go wrong when no reply comes', async () => {
    vi.useFakeTimers();
    try {
      const { session } = sessionWith();
      await session.ready();
      const pending = session.qx('return 1');
      await vi.advanceTimersByTimeAsync(REPLY_TIMEOUT_MS + 10);
      const result = await pending;

      expect(result.ok).toBe(false);
      expect(result, 'which request went unanswered').toMatchObject({ error: expect.stringContaining('qx-') });
      expect(result, 'no pack providing it is still a cause').toMatchObject({
        error: expect.stringContaining(DATABASE_SYSTEM),
      });
      expect(result, 'and an app too old to answer a participant').toMatchObject({
        error: expect.stringContaining(DRIVE_REF),
      });
    } finally {
      vi.useRealTimers();
    }
  });

  /**
   * When the channel itself is the reason, the message says so instead of listing possibilities.
   *
   * This is what `api.failure` is for: a dead connection is not a slow query, and an agent reading "restart the
   * session" acts on it, where a list of three maybes sends it to `/state` for nothing.
   */
  it('quotes the channel when the connection is what failed', async () => {
    vi.useFakeTimers();
    try {
      const { session, fail } = sessionWith();
      await session.ready();
      const pending = session.qx('return 1');
      fail('the app ended the event subscription');
      await vi.advanceTimersByTimeAsync(REPLY_TIMEOUT_MS + 10);

      await expect(pending).resolves.toMatchObject({
        ok: false,
        error: expect.stringContaining('the app ended the event subscription'),
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps serving after a request fails', async () => {
    const { session, send, answer } = sessionWith();
    await session.ready();

    const bad = session.qx('return boom');
    await settle();
    answer({ type: 'QUERY_ERROR', error: 'nope', requestId: sentId(send) });
    await expect(bad).resolves.toMatchObject({ ok: false });

    const good = session.qx('return 1');
    await settle();
    answer({ type: 'QUERY_RESULT', result: 'still here', requestId: sentId(send) });
    await expect(good).resolves.toEqual({ ok: true, value: 'still here' });
  });
});

describe('what /events says about an inbound message', () => {
  /**
   * The one case the page bridge cannot see at all.
   *
   * A message addressed to `host/drive` carries a `client`, so the subscription delivers it to this connection
   * and nowhere else — the renderer never sees it, so the in-page inspector cannot report it. `/events` is
   * therefore the only way an agent notices one, and without the sender it learns that something arrived for it
   * but not who asked: enough to notice a question, not enough to answer it.
   */
  it('keeps the sender of a message addressed to the session', async () => {
    const { session, answer } = sessionWith();
    await session.ready();

    answer({ type: 'DRIVER_QUESTION', question: 'which file?' });
    await settle();

    const [seen] = drained(session.drainEvents()).events;
    expect(seen.to).toBe(DRIVE_REF);
    expect(seen.sender, 'so an agent can answer whoever asked').toBe(DATABASE_SYSTEM);
  });

  // A bridged event is an event rather than an envelope, so it has no sender to keep and must not invent one
  it('leaves it absent for an event seen only in the page', async () => {
    const { session, emit } = sessionWith();
    await session.ready();

    emit({ type: 'TRAIL_UPDATE', event: {} });
    await settle();

    expect(drained(session.drainEvents()).events[0].sender).toBeUndefined();
  });
});

describe('the drains', () => {
  it('hands over the renderer errors and clears them', () => {
    const { session } = sessionWith();

    expect(session.drainErrors()).toEqual({ ok: true, value: ['renderer blew up'] });
    expect(session.drainErrors(), 'cleared, so a long session does not re-report them').toEqual({
      ok: true, value: [],
    });
  });

  /**
   * The fixture throws on any dropped send left after the drive body. A session that ran for an hour
   * would fail at the end over drops the agent had already been told about, so the read clears — and it
   * has to clear in the *page*, where the fixture will look, not in a copy here.
   */
  it('hands over the dropped sends and empties them in the page', async () => {
    const asked: string[] = [];
    const { session } = sessionWith({
      evaluateExpression: async (source: string) => { asked.push(source); return ['one drop']; },
    });

    await expect(session.drainDrops()).resolves.toEqual({ ok: true, value: ['one drop'] });
    expect(asked[0], 'cleared where the fixture reads it').toContain('win.__droppedSends = []');
  });
});

/**
 * `/wait` exists so an agent does not have to re-request `/state` in a loop.
 *
 * The fixture already has the event-driven wait; the verb hands it over. Which of the two it reaches is
 * the whole decision, since they wait on different things.
 */
describe('wait', () => {
  it('waits on a state path, passing the timeout through', async () => {
    const { session, waitForState, waitForPlugin } = sessionWith();
    const result = await session.wait({ state: 'running.connected' }, 2_000);

    expect(result).toEqual({ ok: true, value: { state: 'running.connected' } });
    expect(waitForState).toHaveBeenCalledWith('running.connected', 2_000);
    expect(waitForPlugin, 'the other wait is not the one for a state').not.toHaveBeenCalled();
  });

  it('waits on a plugin arriving instead, when that is what was asked', async () => {
    const { session, waitForState, waitForPlugin } = sessionWith();
    await session.wait({ plugin: 'default-setup/notes' });

    expect(waitForPlugin).toHaveBeenCalledWith('default-setup/notes', undefined);
    expect(waitForState).not.toHaveBeenCalled();
  });

  it('reports a wait that timed out rather than throwing', async () => {
    const { session } = sessionWith({
      waitForState: async () => { throw new Error('Timeout 10000ms exceeded.'); },
    });

    await expect(session.wait({ state: 'never.happens' })).resolves.toEqual({
      ok: false, error: 'wait: Timeout 10000ms exceeded.',
    });
  });
});
