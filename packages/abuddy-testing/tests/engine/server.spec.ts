// The channel's half of the protocol: which verb a path and method reach, and what each kind of bad
// request answers. The split that matters is a *verb* failure answering 200 with `ok: false` — the
// request was fine, the operation was not — against a protocol error answering 4xx, where no verb ran.
import { describe, expect, it, vi } from 'vitest';
import {
  answer, engineVerbs, ENGINE_TOKEN_HEADER, MAX_BODY_BYTES, optionalMs, required, startEngineServer,
  tokenMatches, verb, type Verb,
} from '../../src/engine/server.ts';
import type { EngineResult, EngineSession } from '../../src/engine/session.ts';

const TOKEN = 'a-token';

/** A session that records what it was asked and answers ok, so routing is what the assertions see */
function fakeSession(overrides: Partial<EngineSession> = {}) {
  const called: Array<[string, unknown[]]> = [];
  const verb = (name: string) => (...args: unknown[]): EngineResult => {
    called.push([name, args]);
    return { ok: true, value: name };
  };
  const session = {
    ready: vi.fn(async () => undefined),
    evaluate: verb('evaluate'), send: verb('send'), system: verb('system'),
    qx: verb('qx'), tx: verb('tx'), state: verb('state'), wait: verb('wait'), navigate: verb('navigate'),
    screenshot: verb('screenshot'), drainEvents: verb('events'), drainDrops: verb('drops'),
    drainErrors: verb('errors'), close: verb('close'),
    viewport: verb('viewport'), setViewport: verb('setViewport'),
    ...overrides,
  } as unknown as EngineSession;
  return { session, called };
}

const ask = (
  session: EngineSession,
  url: string,
  { method = 'POST', token = TOKEN, body = '{}' }: { method?: string; token?: string; body?: string } = {},
) => answer(
  engineVerbs(session),
  TOKEN,
  { method, url, headers: { [ENGINE_TOKEN_HEADER]: token } },
  async () => body,
);

describe('the token', () => {
  it('is compared by length first, so the constant-time compare cannot throw', () => {
    expect(tokenMatches('short', 'a-much-longer-token')).toBe(false);
    expect(tokenMatches(TOKEN, TOKEN)).toBe(true);
    expect(tokenMatches(undefined, TOKEN), 'a request with no header at all').toBe(false);
  });

  it('refuses a request without it, before any verb runs', async () => {
    const { session, called } = fakeSession();
    const result = await ask(session, '/state', { method: 'GET', token: 'wrong' });

    expect(result.status).toBe(401);
    expect(result.payload).toMatchObject({ error: expect.stringContaining(ENGINE_TOKEN_HEADER) });
    expect(called, 'nothing ran').toEqual([]);
  });
});

describe('routing', () => {
  it('reaches each verb at its own path', async () => {
    const { session, called } = fakeSession();

    await ask(session, '/eval', { body: '{"code":"return 1"}' });
    await ask(session, '/send', { body: '{"event":{"type":"X"}}' });
    await ask(session, '/send', { body: '{"to":"a/b","event":{"type":"X"}}' });
    await ask(session, '/query', { body: '{"code":"return 1"}' });
    await ask(session, '/transact', { body: '{"code":"return 1"}' });
    await ask(session, '/state', { method: 'GET' });
    await ask(session, '/wait', { body: '{"state":"running.connected"}' });
    await ask(session, '/navigate', { body: '{"plugin":"notes"}' });
    await ask(session, '/screenshot', { body: '{"name":"shot"}' });
    await ask(session, '/events');
    await ask(session, '/drops');
    await ask(session, '/errors');

    // `/send` twice: with `to` it reaches a system, without it the app's root actor — one verb, because
    // that destination is the only thing that ever differed
    expect(called.map(([name]) => name)).toEqual([
      'evaluate', 'send', 'system', 'qx', 'tx', 'state', 'wait',
      'navigate', 'screenshot', 'events', 'drops', 'errors',
    ]);
  });

  it('passes the body through to the verb', async () => {
    const { session, called } = fakeSession();
    await ask(session, '/send', { body: '{"to":"host/packs","event":{"type":"PING","n":1}}' });

    expect(called[0]?.[1]).toEqual(['host/packs', { type: 'PING', n: 1 }]);
  });

  it('names the verbs when the path is not one', async () => {
    const { session } = fakeSession();
    const result = await ask(session, '/nope', { method: 'GET' });

    expect(result.status).toBe(404);
    expect(result.payload, 'so a typo answers with the list').toMatchObject({
      error: expect.stringContaining('/state'),
    });
  });

  it('refuses the wrong method rather than running the verb', async () => {
    const { session, called } = fakeSession();
    const result = await ask(session, '/query', { method: 'GET' });

    expect(result.status).toBe(405);
    expect(called).toEqual([]);
  });

  /**
   * A query string is refused, not stripped. `/qx?code=...` is a caller who believes arguments go in the
   * URL; stripping it would run the verb with no code and blame the missing field, pointing them at the
   * body they did not write.
   */
  it('refuses arguments in the query string, naming where they go', async () => {
    const { session, called } = fakeSession();
    const result = await ask(session, '/qx?code=return%201');

    expect(result.status).toBe(400);
    expect(result.payload).toMatchObject({ error: expect.stringContaining('JSON body') });
    expect(called).toEqual([]);
  });
});

/**
 * The core table is what is true of any AgentBuddy app. A verb built out of one app's nouns belongs to
 * whoever is driving — which is why they arrive as a function over the session, and why they are merged
 * *over* the core table rather than under it: a caller who wants a different `/screenshot` is not wrong.
 */
/**
 * The factory the whole table is built from, which is machinery nothing would otherwise watch.
 *
 * It matters because the declaration is now the parsing: `run` receives what `fields` names and nothing
 * else, which is what makes the vocabulary derivable and what makes a field read without being declared a
 * compile error rather than a drift.
 */
describe('a verb built from its fields', () => {
  const ask = (built: Verb, body: string) => answer(
    { '/x': built }, TOKEN, { method: built.method, url: '/x', headers: { [ENGINE_TOKEN_HEADER]: TOKEN } },
    async () => body,
  );

  it('hands run the fields it declared, read by the readers declared beside them', async () => {
    const seen: unknown[] = [];
    const built = verb({
      method: 'POST',
      fields: { code: required, timeoutMs: optionalMs },
      run: (values) => { seen.push(values); return { ok: true, value: null }; },
    });

    expect(built.fields, 'declaration order, which is the order a missing one is reported in').toEqual(['code', 'timeoutMs']);
    await ask(built, '{"code":"1 + 1","timeoutMs":50}');

    expect(seen).toEqual([{ code: '1 + 1', timeoutMs: 50 }]);
  });

  it('refuses a body missing a declared field, before run is reached', async () => {
    let ran = false;
    const built = verb({
      method: 'POST',
      fields: { code: required },
      run: () => { ran = true; return { ok: true, value: null }; },
    });

    expect(await ask(built, '{}')).toMatchObject({ status: 400, payload: { error: '"code" must be a non-empty string' } });
    expect(ran, 'nothing ran, so ok:false would have misdescribed it').toBe(false);
  });

  it('declares no fields for a verb that takes no body, and hands run nothing', async () => {
    const built = verb({ method: 'POST', run: () => ({ ok: true, value: 'done' }) });

    expect(built.fields).toEqual([]);
    expect(await ask(built, '{"ignored":1}')).toMatchObject({ status: 200, payload: { value: 'done' } });
  });
});

describe("verbs of the caller's own", () => {
  const table = (session: EngineSession, extra: Record<string, Verb>) => ({ ...engineVerbs(session), ...extra });

  const askTable = (verbs: Record<string, Verb>, url: string, method = 'POST') =>
    answer(verbs, TOKEN, { method, url, headers: { [ENGINE_TOKEN_HEADER]: TOKEN } }, async () => '{}');

  it('answers at its own path, beside the core table', async () => {
    const { session } = fakeSession();
    const verbs = table(session, { '/note': verb({ method: 'POST', run: () => ({ ok: true, value: 'a note' }) }) });

    expect(await askTable(verbs, '/note')).toMatchObject({ status: 200, payload: { ok: true, value: 'a note' } });
    expect(await askTable(verbs, '/state', 'GET')).toMatchObject({ status: 200 });
  });

  it('replaces a core verb when it takes its path', async () => {
    const { session, called } = fakeSession();
    const verbs = table(session, { '/screenshot': verb({ method: 'POST', run: () => ({ ok: true, value: 'mine' }) }) });

    expect(await askTable(verbs, '/screenshot')).toMatchObject({ payload: { value: 'mine' } });
    expect(called.map(([name]) => name), 'the core one never ran').toEqual([]);
  });
});

describe('a bad body is a protocol error, not a verb failure', () => {
  it('refuses a missing required field', async () => {
    const { session, called } = fakeSession();
    const result = await ask(session, '/query', { body: '{}' });

    expect(result.status).toBe(400);
    expect(result.payload).toMatchObject({ error: expect.stringContaining('"code"') });
    expect(called, 'nothing reached the app, so ok:false would have misdescribed it').toEqual([]);
  });

  it('refuses an empty string as a required field', async () => {
    const { session } = fakeSession();
    expect((await ask(session, '/eval', { body: '{"code":""}' })).status).toBe(400);
  });

  it('refuses an event that is not an object', async () => {
    const { session } = fakeSession();
    expect((await ask(session, '/send', { body: '{"event":"X"}' })).status).toBe(400);
    expect((await ask(session, '/send', { body: '{"event":[]}' })).status).toBe(400);
  });

  it('refuses a body that is not JSON, and says so', async () => {
    const { session } = fakeSession();
    const result = await ask(session, '/query', { body: 'not json' });

    expect(result.status).toBe(400);
    expect(result.payload).toMatchObject({ error: expect.stringContaining('not JSON') });
  });

  it('refuses a JSON body that is not an object', async () => {
    const { session } = fakeSession();
    expect((await ask(session, '/query', { body: '[1,2]' })).status).toBe(400);
  });

  it('treats an empty body as an empty object, so a verb needing nothing needs no body', async () => {
    const { session } = fakeSession();
    const result = await ask(session, '/events', { body: '' });

    expect(result.status).toBe(200);
    expect(result.payload).toEqual({ ok: true, value: 'events' });
  });
});

/**
 * `/close` answers, and the *caller* ends the session once that answer has been written.
 *
 * Ending it inside the verb closed the socket before the response flushed, so the agent saw a reset for
 * a request that had worked — found by driving a real session, which is why the flag is asserted here
 * rather than the ending being assumed.
 */
describe('close', () => {
  it('answers ok and reports that the session is ending', async () => {
    const { session } = fakeSession();
    const result = await ask(session, '/close');

    expect(result.status).toBe(200);
    expect(result.payload).toEqual({ ok: true, value: 'closing' });
    expect(result.ending, 'the channel ends the session after it has replied').toBe(true);
  });

  it('is the only verb that reports it', async () => {
    const { session } = fakeSession();

    expect((await ask(session, '/state', { method: 'GET' })).ending).toBeUndefined();
    expect((await ask(session, '/query', { body: '{"code":"return 1"}' })).ending).toBeUndefined();
  });

  it('does not end the session when the request was refused', async () => {
    const { session } = fakeSession();

    expect((await ask(session, '/close', { token: 'wrong' })).ending, 'a bad token').toBeUndefined();
    expect((await ask(session, '/close', { method: 'GET' })).ending, 'the wrong method').toBeUndefined();
  });
});

/**
 * `/screenshot` is the one verb that turns request input into a filesystem path.
 *
 * `app.screenshot` joins the name onto the screenshots directory, so `../../escaped` wrote outside it —
 * measured against a bound server before this. Refused rather than stripped: stripping would write a
 * different file than the caller named.
 */
describe('a screenshot name', () => {
  it('refuses a name that climbs out of the directory', async () => {
    const { session, called } = fakeSession();

    for (const name of ['../../escaped', 'a/b', 'a\\b', '..', 'x/../y']) {
      const result = await ask(session, '/screenshot', { body: JSON.stringify({ name }) });
      expect(result.status, name).toBe(400);
    }
    expect(called, 'none of them reached the app').toEqual([]);
  });

  it('allows an ordinary name', async () => {
    const { session, called } = fakeSession();
    const result = await ask(session, '/screenshot', { body: '{"name":"notes-panel_2.v1"}' });

    expect(result.status).toBe(200);
    expect(called.map(([name]) => name)).toEqual(['screenshot']);
  });
});

describe('wait', () => {
  it('needs exactly one of state or plugin', async () => {
    const { session, called } = fakeSession();

    expect((await ask(session, '/wait', { body: '{}' })).status, 'neither').toBe(400);
    expect((await ask(session, '/wait', { body: '{"state":"a","plugin":"b"}' })).status, 'both').toBe(400);
    expect(called).toEqual([]);
  });

  it('refuses a timeout that is not a positive number', async () => {
    const { session } = fakeSession();

    for (const timeoutMs of ['1000', 0, -5, null]) {
      const body = JSON.stringify({ state: 'a', timeoutMs });
      expect((await ask(session, '/wait', { body })).status, String(timeoutMs)).toBe(400);
    }
  });

  it('passes the target and the timeout to the session', async () => {
    const { session, called } = fakeSession();
    await ask(session, '/wait', { body: '{"state":"running.connected","timeoutMs":2000}' });

    expect(called).toEqual([['wait', [{ state: 'running.connected' }, 2000]]]);
  });
});

describe('a viewport', () => {
  it('refuses a size that is not one, rather than passing it to the window', async () => {
    const { session, called } = fakeSession();

    // A fractional or zero size is a caller who meant something else, and a string is a caller who sent
    // the shape `/wait`'s `timeoutMs` already refuses
    for (const size of [{ width: '1400', height: 900 }, { width: 0, height: 900 }, { width: 1400 },
      { width: 1400.5, height: 900 }, { width: 1400, height: null }]) {
      const body = JSON.stringify(size);
      expect((await ask(session, '/set-viewport', { body })).status, body).toBe(400);
    }
    expect(called, 'nothing reached the window').toEqual([]);
  });

  it('passes a size through, and answers the read with a GET', async () => {
    const { session, called } = fakeSession();

    await ask(session, '/set-viewport', { body: '{"width":1200,"height":800}' });
    expect(called).toEqual([['setViewport', [1200, 800]]]);

    expect((await ask(session, '/viewport', { method: 'GET' })).status).toBe(200);
  });
});

/** The distinction the whole status scheme rests on */
describe('a verb that fails', () => {
  it('answers 200 with ok false, so the reason is what the caller reads', async () => {
    const { session } = fakeSession({
      qx: async () => ({ ok: false, error: 'qx: boom is not defined' }),
    });
    const result = await ask(session, '/query', { body: '{"code":"return boom"}' });

    expect(result.status, 'the request was fine; the operation was not').toBe(200);
    expect(result.payload).toEqual({ ok: false, error: 'qx: boom is not defined' });
  });
});

describe('the bound server', () => {
  it('listens on loopback, answers a verb and closes', async () => {
    const { session, called } = fakeSession();
    let closed = 0;
    const engine = await startEngineServer(session, () => { closed += 1; });

    try {
      expect(engine.address.port, 'the OS picked it, so it is published rather than agreed').toBeGreaterThan(0);
      expect(engine.address.token.length).toBeGreaterThan(16);

      const response = await fetch(`http://127.0.0.1:${engine.address.port}/state`, {
        headers: { [ENGINE_TOKEN_HEADER]: engine.address.token },
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true, value: 'state' });
      expect(called.map(([name]) => name)).toEqual(['state']);

      const refused = await fetch(`http://127.0.0.1:${engine.address.port}/state`);
      expect(refused.status, 'a request with no token').toBe(401);
    } finally {
      await engine.close();
    }
  });

  // Through the server rather than a table built here: the merge is `startEngineServer`'s, and a case that
  // composes the table itself passes whether or not the server does it
  it("serves a caller's own verb", async () => {
    const { session } = fakeSession();
    const engine = await startEngineServer(session, () => undefined, () => ({
      '/note': verb({ method: 'POST', run: () => ({ ok: true, value: 'a note' }) }),
    }));

    try {
      const response = await fetch(`http://127.0.0.1:${engine.address.port}/note`, {
        method: 'POST',
        headers: { [ENGINE_TOKEN_HEADER]: engine.address.token },
        body: '{}',
      });
      expect(await response.json()).toEqual({ ok: true, value: 'a note' });
    } finally {
      await engine.close();
    }
  });

  it('installs the in-page bridge before it listens', async () => {
    const ready = vi.fn(async () => undefined);
    const { session } = fakeSession({ ready });
    const engine = await startEngineServer(session, () => undefined);

    // Listening before the bridge existed would drop the replies of any request that arrived first
    expect(ready).toHaveBeenCalledOnce();
    await engine.close();
  });

  it('caps the body it will read', () => {
    // A mistake on a local channel should not be able to exhaust the session the agent is driving
    expect(MAX_BODY_BYTES).toBeLessThanOrEqual(1_000_000);
  });

  /**
   * The cap has to answer, not hang up.
   *
   * It used to `destroy()` the request, which took the socket down before the `400` was written — the
   * caller got `fetch failed` and never saw the message naming the cap. This is the case that would not
   * have caught it from the inside, so it goes through a real socket.
   */
  it('answers 400 over the wire when the body is past the cap', async () => {
    const { session, called } = fakeSession();
    const engine = await startEngineServer(session, () => undefined);

    try {
      const response = await fetch(`http://127.0.0.1:${engine.address.port}/eval`, {
        method: 'POST',
        headers: { [ENGINE_TOKEN_HEADER]: engine.address.token, 'content-type': 'application/json' },
        body: JSON.stringify({ body: 'x'.repeat(MAX_BODY_BYTES + 1_000) }),
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: expect.stringContaining('larger than') });
      expect(called, 'nothing ran').toEqual([]);
    } finally {
      await engine.close();
    }
  });
});
