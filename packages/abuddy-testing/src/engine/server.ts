/**
 * The channel a live drive session answers on: loopback HTTP, one token, JSON both ways.
 *
 * **HTTP because the caller is an agent holding a shell.** A Playwright worker has no stdin at all
 * (the runner forks it with `stdio: ['ignore', ...]`), so a REPL cannot live inside a drive script; and
 * an agent that drives through separate shell calls cannot keep a pipe open between them anyway. A
 * request it can make with `curl` works from any call, needs no client, and ends when the response does.
 *
 * **Two kinds of failure, two kinds of status.** A verb that fails answers `200` with `ok: false` — the
 * request was fine and the operation was not, which is the common case while driving and which `curl`
 * reports as success so the agent reads the reason rather than an exit code. A malformed request, a bad
 * token or an unknown path is `4xx`, because the caller got the protocol wrong and no verb ran.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { API_HOST } from '@abuddy/sdk/utils/pure';
import type { EngineResult, EngineSession } from './session.ts';

/**
 * The header the token travels in.
 *
 * Its own name rather than the API's `API_TOKEN_HEADER`: this is a different server with a different
 * token and a different lifetime, and a shared header name would make a token sent to the wrong one look
 * like a configuration problem instead of the mistake it is. The *address* is shared — `API_HOST` is this
 * repo's one definition of "loopback only", and an engine that bound anywhere else would be reachable
 * off the machine.
 */
export const ENGINE_TOKEN_HEADER = 'x-abuddy-drive-token';

/** The one verb whose answer is followed by the session ending */
export const CLOSE_PATH = '/close';

/** The largest request body the engine will read, so a mistake cannot exhaust the session's memory */
export const MAX_BODY_BYTES = 1_000_000;

export interface EngineAddress {
  readonly port: number;
  readonly token: string;
}

export interface RunningEngine {
  readonly address: EngineAddress;
  readonly close: () => Promise<void>;
}

/** A verb, and whether it reads a JSON body */
/**
 * One entry in the table a session answers from.
 *
 * Exported because the table is extensible: a verb built out of one app's nouns — "create a thread",
 * "approve the pending call" — belongs to whoever is driving, not to this package, and is added through
 * `runDriveEngine`'s `verbs`.
 */
export type Verb = {
  readonly method: 'GET' | 'POST';
  readonly run: (body: Record<string, unknown>) => EngineResult | Promise<EngineResult>;
};

/** Verbs of a caller's own, over the session they drive. Merged over the core table, so one may be replaced */
export type ExtraVerbs = (session: EngineSession) => Record<string, Verb>;

/** Raised where the caller got the protocol wrong, so the answer is 4xx and no verb ran */
class BadRequest extends Error {}

/**
 * Which field each verb needs, named once so a missing one is reported the same way everywhere.
 *
 * A verb whose required field is absent is a protocol error, not a verb failure: nothing ran, and
 * answering `ok: false` would read as "the app refused" when the request never reached it.
 */
const required = (body: Record<string, unknown>, field: string): string => {
  const value = body[field];
  if (typeof value !== 'string' || value === '') throw new BadRequest(`"${field}" must be a non-empty string`);
  return value;
};

/**
 * A file name, refused rather than sanitised.
 *
 * `/screenshot` is the one verb that turns request input into a filesystem path — `app.screenshot`
 * joins it onto the screenshots directory — so `../../escaped` wrote outside it, measured. Refusing
 * says so; stripping the separators would quietly write a different file than the caller named.
 */
const safeName = (body: Record<string, unknown>, field: string): string => {
  const value = required(body, field);
  if (!/^[\w.-]+$/.test(value) || value.includes('..')) {
    throw new BadRequest(`"${field}" must be a file name: letters, digits, dot, dash, underscore`);
  }
  return value;
};

/** An optional string, refused when present and empty: a caller who sent one meant to narrow something */
const optionalText = (body: Record<string, unknown>, field: string): string | undefined => {
  if (body[field] === undefined) return undefined;
  return required(body, field);
};

/** An optional positive number, so a timeout a caller sent as a string is refused rather than ignored */
const optionalMs = (body: Record<string, unknown>, field: string): number | undefined => {
  const value = body[field];
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new BadRequest(`"${field}" must be a positive number of milliseconds`);
  }
  return value;
};

const object = (body: Record<string, unknown>, field: string): Record<string, unknown> => {
  const value = body[field];
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequest(`"${field}" must be an object`);
  }
  return value as Record<string, unknown>;
};

export function engineVerbs(session: EngineSession): Record<string, Verb> {
  return {
    '/eval': { method: 'POST', run: (body) => session.evaluate(required(body, 'code')) },
    /**
     * One verb for one act. `to` names a system; without it the event goes to the app's root actor, which
     * is the only difference there ever was between this and the `/system` it replaced.
     */
    '/send': {
      method: 'POST',
      run: (body) => (body.to === undefined
        ? session.send(object(body, 'event'))
        : session.system(required(body, 'to'), object(body, 'event'))),
    },
    // `qx` and `tx` are the names of the code you write, not of the thing you ask for
    '/query': { method: 'POST', run: (body) => session.qx(required(body, 'code')) },
    '/transact': { method: 'POST', run: (body) => session.tx(required(body, 'code')) },
    '/state': { method: 'GET', run: () => session.state() },
    '/navigate': { method: 'POST', run: (body) => session.navigate(required(body, 'plugin')) },
    // What a view is actually showing, which was a hand-written `/eval` expression at every call site
    '/plugin': {
      method: 'POST',
      run: (body) => session.plugin(required(body, 'plugin'), optionalText(body, 'select')),
    },
    '/click': { method: 'POST', run: (body) => session.click(required(body, 'selector')) },
    '/fill': { method: 'POST', run: (body) => session.fill(required(body, 'selector'), required(body, 'text')) },
    '/press': { method: 'POST', run: (body) => session.press(required(body, 'key'), optionalText(body, 'selector')) },
    '/snapshot': { method: 'GET', run: () => session.snapshot() },
    '/logs': {
      method: 'POST',
      run: (body) => session.logs({ since: optionalText(body, 'since'), source: optionalText(body, 'source') }),
    },
    '/screenshot': { method: 'POST', run: (body) => session.screenshot(safeName(body, 'name')) },
    // Takes no body: there is one window and one thing to do to it
    '/reload': { method: 'POST', run: () => session.reload() },
    /**
     * One of `state` or `plugin`, never both: they wait on different things, and a request carrying
     * both is a caller who does not know which they meant rather than one asking for either.
     */
    '/wait': {
      method: 'POST',
      run: (body) => {
        const hasState = body.state !== undefined;
        const hasPlugin = body.plugin !== undefined;
        if (hasState === hasPlugin) throw new BadRequest('send exactly one of "state" or "plugin"');
        const target = hasState
          ? { state: required(body, 'state') }
          : { plugin: required(body, 'plugin') };
        return session.wait(target, optionalMs(body, 'timeoutMs'));
      },
    },
    // POST because each of these *clears* what it returns: a GET that answers differently on a retry is
    // a trap, and draining is right — a session open for an hour would otherwise collect every event
    '/events': { method: 'POST', run: () => session.drainEvents() },
    '/drops': { method: 'POST', run: () => session.drainDrops() },
    '/errors': { method: 'POST', run: () => session.drainErrors() },
    /**
     * Answers, and the *caller* of `answer` ends the session once this reply has been written.
     *
     * Ending it here closed the socket before the response flushed, so `curl` reported a reset for a
     * request that had done exactly what was asked. Measured, not reasoned about.
     */
    '/close': { method: 'POST', run: () => ({ ok: true, value: 'closing' }) },
  };
}

/** Constant-time, as the API's own token comparison is: a length check first, since the compare needs it */
export const tokenMatches = (given: string | undefined, token: string): boolean => {
  if (given === undefined) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
};

/**
 * Reads the body, and stops reading past the cap **without destroying the request**.
 *
 * It used to `destroy()`, which took the socket down before the `400` could be written: measured, the
 * caller got `fetch failed` and never saw the message naming the cap. So the refusal stops collecting
 * and lets the response go out — the rest of the upload is read and dropped, which costs nothing on a
 * loopback channel and is what keeps the answer deliverable.
 */
const readBody = (request: IncomingMessage): Promise<string> => new Promise((resolve, reject) => {
  let size = 0;
  let refused = false;
  const chunks: Buffer[] = [];
  request.on('data', (chunk: Buffer) => {
    if (refused) return;
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      refused = true;
      chunks.length = 0;
      reject(new BadRequest(`the body is larger than ${MAX_BODY_BYTES} bytes`));
      return;
    }
    chunks.push(chunk);
  });
  request.on('end', () => { if (!refused) resolve(Buffer.concat(chunks).toString('utf8')); });
  request.on('error', reject);
});

const send = (response: ServerResponse, status: number, payload: unknown): void => {
  const text = JSON.stringify(payload);
  response.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(text) });
  response.end(text);
};

/**
 * Answers one request. Exported so the routing is exercised without a socket — what a spec wants to
 * know is which verb a path and method reach and what a bad request answers, not that `node:http` works.
 */
export async function answer(
  verbs: Record<string, Verb>,
  token: string,
  request: { method?: string; url?: string; headers: Record<string, string | string[] | undefined> },
  readRequestBody: () => Promise<string>,
): Promise<{ status: number; payload: unknown; ending?: true }> {
  const header = request.headers[ENGINE_TOKEN_HEADER];
  if (!tokenMatches(Array.isArray(header) ? header[0] : header, token)) {
    return { status: 401, payload: { ok: false, error: `missing or wrong ${ENGINE_TOKEN_HEADER}` } };
  }
  const url = request.url ?? '';
  // Refused rather than stripped. Arguments travel in the JSON body, so `/qx?code=...` is a caller who
  // believes otherwise — and stripping it would run the verb with no code and blame the missing field,
  // which sends them looking in the wrong place.
  if (url.includes('?')) {
    return {
      status: 400,
      payload: { ok: false, error: 'arguments go in the JSON body, not the query string' },
    };
  }
  const verb = verbs[url];
  if (verb === undefined) {
    return {
      status: 404,
      payload: { ok: false, error: `no such verb: ${url} — try ${Object.keys(verbs).sort().join(' ')}` },
    };
  }
  if (request.method !== verb.method) {
    return { status: 405, payload: { ok: false, error: `${url} wants ${verb.method}` } };
  }
  try {
    const raw = verb.method === 'POST' ? await readRequestBody() : '';
    const body = raw.trim() === '' ? {} : JSON.parse(raw) as Record<string, unknown>;
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequest('the body must be a JSON object');
    }
    const payload = await verb.run(body);
    return url === CLOSE_PATH ? { status: 200, payload, ending: true } : { status: 200, payload };
  } catch (error) {
    if (error instanceof BadRequest) return { status: 400, payload: { ok: false, error: error.message } };
    if (error instanceof SyntaxError) {
      return { status: 400, payload: { ok: false, error: `the body is not JSON: ${error.message}` } };
    }
    throw error;
  }
}

/**
 * Binds the engine and returns where it is listening.
 *
 * Port `0`, so the OS picks: a fixed port would collide between two packs driving at once, and the
 * address is published for the agent to read rather than agreed in advance. The token is minted here
 * rather than taken from the environment, because the session's lifetime is the token's — a session that
 * has ended cannot be driven with a token someone kept.
 */
export async function startEngineServer(
  session: EngineSession,
  /** Called once `/close` has been answered, so the drive body returns and the fixture tears down */
  onClose: () => void,
  /** A caller's own verbs, merged over the core table */
  extra?: ExtraVerbs,
): Promise<RunningEngine> {
  const token = randomBytes(24).toString('hex');
  const verbs = { ...engineVerbs(session), ...extra?.(session) };
  await session.ready();

  const server: Server = createServer((request, response) => {
    void answer(verbs, token, request, () => readBody(request))
      .then(({ status, payload, ending }) => {
        // The order is the point: the reply is written, the socket drains, and only then does the
        // session end. `finish` fires when the response has been handed to the OS
        if (ending === true) response.once('finish', onClose);
        send(response, status, payload);
      })
      // The engine outliving one bad request matters more than the request: a driving session that died
      // because a verb threw where it was not expected to would take the app with it
      .catch((error: unknown) => send(response, 500, {
        ok: false,
        error: `the engine failed to answer: ${error instanceof Error ? error.message : String(error)}`,
      }));
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, API_HOST, resolve);
  });
  const bound = server.address();
  if (bound === null || typeof bound === 'string') throw new Error('the engine did not bind a port');

  return {
    address: { port: bound.port, token },
    close: () => new Promise<void>((resolve) => {
      // Open sockets would hold the process past the drive body returning, so the session would hang at
      // the one moment it is trying to end
      server.closeAllConnections();
      server.close(() => resolve());
    }),
  };
}
