/**
 * Talking to a drive session over HTTP, from Node.
 *
 * `abuddy drive --serve` holds an app open and answers verbs; this is the other end of that, for a caller
 * that wants **one** answer. The verbs, the `{ ok, value }` envelope and `evalSource`'s total handling of a
 * result that cannot cross the process boundary are all the engine's and are not restated here — what is
 * here is the address, the request, and how a status becomes an exit code.
 *
 * **Why this is in `@abuddy/cli` and not in `@abuddy/testing` beside the engine it talks to.**
 * `@abuddy/testing` is a *devDependency* of this package and nothing in `src/` imports it: making it a real
 * dependency would put the Playwright harness in every pack that installs the CLI, and `bundle-package.ts`
 * refuses an external it cannot find in `dependencies` outright. The same bind already produced the
 * two-declarations-and-a-gate answer for `ENGINE_SESSION_FILE`, and `@app/repo-checks`'
 * `playwright-config.spec.ts` compares the strings below against the engine's for the same reason.
 *
 * The repo's own `scripts/drive-eval.ts` imports this by relative path, which is allowed and already done
 * elsewhere (`scripts/lib/import-populations.ts` imports `src/build/pack-sources.ts`): root `scripts/` is in
 * no import-rule population, so the shared half can live where it belongs rather than in a package both
 * callers happen to depend on.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

/** `@abuddy/testing`'s `ENGINE_TOKEN_HEADER` */
export const ENGINE_TOKEN_HEADER = 'x-abuddy-drive-token';
/** `@abuddy/testing`'s `MARKER_FILE`, in the `outputDir` Playwright wipes at the start of every run */
export const MARKER_FILE = 'engine.json';
/** `@abuddy/testing`'s `ENGINE_READY`: what a listening session prints, and so what a parent waits for */
export const ENGINE_READY = 'drive engine listening on';
/** The verb that ends a session, which is the only graceful way to stop one */
export const CLOSE_PATH = '/close';

/** A question this can ask, on the wire */
export interface EngineAsk {
  readonly method: 'GET' | 'POST';
  readonly path: string;
  /** The body field the verb reads, for the ones that take an argument */
  readonly field?: 'code';
}

/**
 * The questions a one-shot can ask, keyed by the flag that asks them.
 *
 * A subset of the engine's vocabulary on purpose: every verb is reachable from a running session, and what
 * a one-shot is for is the question you ask *before* you have one — which is a read. A write through a
 * session that closes a moment later is a thing to be able to explain rather than a convenience.
 */
export const ONE_SHOT_ASKS = {
  eval: { method: 'POST', path: '/eval', field: 'code' },
  query: { method: 'POST', path: '/query', field: 'code' },
  state: { method: 'GET', path: '/state' },
} as const satisfies Record<string, EngineAsk>;

export type AskName = keyof typeof ONE_SHOT_ASKS;

/** Where a session says it is. The pid is here so a message about an unreachable one can name it */
export interface EngineMarker {
  readonly host: string;
  readonly port: number;
  readonly token: string;
  readonly pid?: number;
}

/** Why a marker could not be used, as a sentence, or the marker */
export type MarkerRead = { readonly marker: EngineMarker } | { readonly problem: string };

/**
 * Reads the session's marker, or says why it cannot.
 *
 * `startHint` is the command *this caller* would tell someone to run, because the right answer differs by
 * entry point: `abuddy drive --serve` is wrong advice at this repo's root, where the script is
 * `npm run drive:serve`.
 */
export function readEngineMarker(resultsDir: string, startHint: string): MarkerRead {
  const file = path.join(resultsDir, MARKER_FILE);
  const where = path.relative(process.cwd(), file).split(path.sep).join('/');
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (err) {
    if ((err as { code?: string }).code === 'ENOENT') {
      return { problem: `no drive session: ${where} is not there. Start one with \`${startHint}\`, or drop --attach to launch an app for this one question.` };
    }
    return { problem: `${where} could not be read: ${err instanceof Error ? err.message : String(err)}` };
  }
  const { host, port, token, pid } = (parsed ?? {}) as Partial<EngineMarker>;
  if (typeof host !== 'string' || typeof port !== 'number' || typeof token !== 'string') {
    return { problem: `${where} is not a drive session marker: it needs a host, a port and a token.` };
  }
  return { marker: { host, port, token, ...(typeof pid === 'number' ? { pid } : {}) } };
}

/** What the engine answered, or why nothing did */
export type Answered = { readonly status: number; readonly body: unknown } | { readonly unreachable: string };

/** Asks one verb of a session that is already listening. A refusal is an answer; a dead socket is not */
export async function askEngine(marker: EngineMarker, ask: EngineAsk, argument?: string): Promise<Answered> {
  const at = `http://${marker.host}:${marker.port}${ask.path}`;
  let response: Response;
  try {
    response = await fetch(at, {
      method: ask.method,
      headers: {
        [ENGINE_TOKEN_HEADER]: marker.token,
        ...(ask.field === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(ask.field === undefined ? {} : { body: JSON.stringify({ [ask.field]: argument ?? '' }) }),
    });
  } catch (err) {
    // A marker can only outlive its session if the writer was killed without tearing down, so name the pid:
    // it is in the marker for exactly this, and `kill <pid>` is the thing the reader wants next
    const whose = marker.pid === undefined ? '' : ` (pid ${marker.pid})`;
    return {
      unreachable: `${MARKER_FILE} points at ${marker.host}:${marker.port}${whose} and nothing answered:`
        + ` ${err instanceof Error ? err.message : String(err)}. The session may have been killed without`
        + ' tearing down.',
    };
  }
  const text = await response.text();
  try {
    return { status: response.status, body: JSON.parse(text) };
  } catch {
    return { unreachable: `the session answered ${response.status} with something that is not JSON: ${text.slice(0, 200)}` };
  }
}

/** The line a one-shot prints, and the code it exits with */
export interface Outcome {
  readonly line: string;
  readonly code: 0 | 1;
}

const envelope = (value: Record<string, unknown>): string => JSON.stringify(value);

/**
 * What to print and what to exit with.
 *
 * **The exit code comes from the body's `ok`, never from the HTTP status**, and that is the whole of this
 * function. The engine wraps every verb in `attempt`, which turns a verb that threw into `ok: false` with
 * **status 200** — so reading the status would exit 0 on every real failure, and nothing downstream would
 * notice. The status is still read for the opposite case: a 401, 400, 404 or 405 means the request never
 * reached a verb, and the engine's own `{ ok: false, error }` for those is passed through verbatim rather
 * than reworded.
 */
export function oneShotOutcome(answered: Answered): Outcome {
  if ('unreachable' in answered) return { line: envelope({ ok: false, error: answered.unreachable }), code: 1 };
  const { body } = answered;
  if (body === null || typeof body !== 'object' || typeof (body as { ok?: unknown }).ok !== 'boolean') {
    return { line: envelope({ ok: false, error: `the session answered something that is not an envelope: ${JSON.stringify(body).slice(0, 200)}` }), code: 1 };
  }
  return { line: envelope(body as Record<string, unknown>), code: (body as { ok: boolean }).ok ? 0 : 1 };
}
