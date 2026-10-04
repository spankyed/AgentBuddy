// The protocol a live drive session speaks, against a fake page. What is checked here is that every verb
// answers rather than throws, and that the two things the real app would make expensive to discover —
// a result that cannot cross the process boundary, and two bus round-trips sharing a reply with no
// request id — are handled before anything launches Electron.
import { describe, expect, it, vi } from 'vitest';
import {
  BRIDGE_FLAG, BRIDGE_FUNCTION, createSession, DATABASE_SYSTEM, evalSource, MAX_SEEN_EVENTS,
  REPLY_TIMEOUT_MS, type SeenEvent, type SessionPage,
} from '../../src/engine/session.ts';

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

const sessionWith = (overrides: Partial<SessionPage> = {}) => {
  const fake = fakePage();
  const errors = ['renderer blew up'];
  const session = createSession({
    page: { ...fake.page, ...overrides },
    takeErrors: () => errors.splice(0, errors.length),
  });
  return { ...fake, session };
};

/**
 * The `[to, event]` tuple the page was last asked to send, or a failure that says nothing was sent.
 *
 * Destructuring straight off `calls.at(-1)?.[1]` throws an opaque `TypeError` when no send happened,
 * which is the likeliest thing to go wrong in a test about sends.
 */
const lastSend = (calls: { mock: { calls: unknown[][] } }): [string, Record<string, unknown>] => {
  const call = calls.mock.calls.at(-1);
  if (call === undefined) throw new Error('nothing was sent to the page');
  return call[1] as [string, Record<string, unknown>];
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
    const { session, emit, evaluateWith } = sessionWith();
    await session.ready();

    for (let n = 0; n < MAX_SEEN_EVENTS; n += 1) emit({ type: `E${n}`, event: {} });
    const pending = session.qx('return 1');
    await settle();
    const requestId = String(lastSend(evaluateWith)[1].requestId);
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
    String(lastSend(calls)[1].requestId);

  it('sends to the database system with an id, and resolves on the reply that carries it', async () => {
    const { session, emit, evaluateWith } = sessionWith();
    await session.ready();

    const pending = session.qx('return 42');
    await settle();
    const [to, event] = lastSend(evaluateWith);
    expect(to).toBe(DATABASE_SYSTEM);
    expect(event).toMatchObject({ type: 'EXECUTE_QUERY', code: 'return 42' });
    expect(event.requestId, 'minted by the requester, not the replier').toEqual(expect.any(String));

    emit({ type: 'QUERY_RESULT', event: { result: 42, requestId: sentId(evaluateWith) } });
    await expect(pending).resolves.toEqual({ ok: true, value: 42 });
  });

  it('turns the error reply into ok false, carrying the system message', async () => {
    const { session, emit, evaluateWith } = sessionWith();
    await session.ready();

    const pending = session.qx('return boom');
    await settle();
    emit({
      type: 'QUERY_ERROR',
      event: { error: 'boom is not defined', requestId: sentId(evaluateWith) },
    });

    await expect(pending).resolves.toEqual({ ok: false, error: 'qx: boom is not defined' });
  });

  it('uses the transaction events for tx, not the query ones', async () => {
    const { session, emit, evaluateWith } = sessionWith();
    await session.ready();

    const pending = session.tx('return tx(...)');
    await settle();
    const [, event] = lastSend(evaluateWith);
    expect(event).toMatchObject({ type: 'EXECUTE_TRANSACTION', code: 'return tx(...)' });

    const requestId = sentId(evaluateWith);
    // A QUERY_RESULT carrying the same id must not satisfy a transaction either: the type and the id
    // are both part of the answer, and only one of them is enough to be wrong
    emit({ type: 'QUERY_RESULT', event: { result: 'wrong', requestId } });
    emit({ type: 'TRANSACTION_RESULT', event: { result: 'right', requestId } });
    await expect(pending).resolves.toEqual({ ok: true, value: 'right' });
  });

  /** Someone else's query — a person in the Database plugin while a session drives */
  it('ignores a reply for a request it did not make', async () => {
    const { session, emit, evaluateWith } = sessionWith();
    await session.ready();

    const pending = session.qx('return mine');
    await settle();
    emit({ type: 'QUERY_RESULT', event: { result: 'someone else', requestId: 'q-elsewhere' } });
    await settle();

    emit({ type: 'QUERY_RESULT', event: { result: 'mine', requestId: sentId(evaluateWith) } });
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
      const { session, emit, evaluateWith } = sessionWith();
      await session.ready();

      const abandoned = session.qx('return slow');
      await vi.advanceTimersByTimeAsync(0);
      const orphanId = sentId(evaluateWith);
      await vi.advanceTimersByTimeAsync(REPLY_TIMEOUT_MS + 10);
      await expect(abandoned).resolves.toMatchObject({ ok: false });

      const next = session.qx('return quick');
      await vi.advanceTimersByTimeAsync(0);
      // The slow query finishes at last, with nobody waiting for it
      emit({ type: 'QUERY_RESULT', event: { result: 'the abandoned one', requestId: orphanId } });
      await vi.advanceTimersByTimeAsync(0);

      emit({ type: 'QUERY_RESULT', event: { result: 'its own', requestId: sentId(evaluateWith) } });
      await expect(next).resolves.toEqual({ ok: true, value: 'its own' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('names the request and the diagnostics when no reply comes', async () => {
    vi.useFakeTimers();
    try {
      const { session } = sessionWith();
      await session.ready();
      const pending = session.qx('return 1');
      await vi.advanceTimersByTimeAsync(REPLY_TIMEOUT_MS + 10);
      const result = await pending;

      expect(result.ok).toBe(false);
      expect(result, 'the root state').toMatchObject({ error: expect.stringContaining('/state') });
      expect(result, 'and the renderer errors').toMatchObject({ error: expect.stringContaining('/errors') });
      expect(result, 'the cause that actually happens').toMatchObject({
        error: expect.stringContaining('BigInt'),
      });
      expect(result, 'the rare one is still named, last').toMatchObject({
        error: expect.stringContaining(DATABASE_SYSTEM),
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps serving after a request fails', async () => {
    const { session, emit, evaluateWith } = sessionWith();
    await session.ready();

    const bad = session.qx('return boom');
    await settle();
    emit({ type: 'QUERY_ERROR', event: { error: 'nope', requestId: sentId(evaluateWith) } });
    await expect(bad).resolves.toMatchObject({ ok: false });

    const good = session.qx('return 1');
    await settle();
    emit({ type: 'QUERY_RESULT', event: { result: 'still here', requestId: sentId(evaluateWith) } });
    await expect(good).resolves.toEqual({ ok: true, value: 'still here' });
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
