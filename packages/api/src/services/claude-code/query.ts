/**
 * High-level streaming conversation API.
 *
 * `query()` spawns `claude -p` in stream-json mode, drives the control loop,
 * and exposes two things to the caller:
 *
 *   - an async iterable of parsed stream events (everything except the
 *     control-request traffic, which is handled internally)
 *   - a `result` promise that resolves with the final normalised result
 *
 * Two modes, picked by whether an initial `prompt` is provided:
 *
 *  1. **Single-turn (default)**: pass `{ prompt }`. The wrapper writes the
 *     turn, immediately EOFs stdin, and the CLI runs once + exits. Drain
 *     `handle.events` in a `for await` and then `await handle.result`.
 *     No cleanup needed — the child unwinds itself.
 *
 *  2. **Multi-turn (opt-in)**: pass `{ keepStdinOpen: true, prompt }` OR
 *     pass no prompt. The wrapper leaves stdin open; the caller drives
 *     follow-up turns via `handle.send(text)` and MUST call `handle.close()`
 *     when done. Forgetting to close hangs the child until process exit.
 *
 * The implementation uses a fan-out: the raw NDJSON stream from the child is
 * consumed once by an internal pump that (a) routes control requests to the
 * control router and (b) pushes everything else into an async queue the
 * public iterable reads from. This is the only way to share a single Readable
 * between "internal logic" and "caller" without races.
 */

import { argsFromOptions } from './args'
import { createControlRouter } from './control'
import {
  ClaudeAbortError,
  type ClaudeCodeError,
  ClaudeExitError,
  ClaudeProtocolError,
  ClaudeResultError,
} from './errors'
import { spawnStream, type StreamHandle } from './runner'
import type {
  KnownStreamLine,
  QueryOptions,
  QueryResult,
  ResultLine,
  StreamLine,
  UserInputMessage,
} from './types'

export interface QueryHandle {
  /** Resolves with the session id as soon as the CLI emits `system/init`. */
  readonly sessionId: Promise<string>
  /** Every non-control stream line, in order, until the child exits. */
  readonly events: AsyncIterable<StreamLine>
  /** Final normalised result. Rejects on error result or non-zero exit. */
  readonly result: Promise<QueryResult>
  /** Send another user turn. No-op after close(). */
  send(text: string | UserInputMessage): void
  /** Ask the CLI to cancel the current turn (interrupt control request). */
  interrupt(): void
  /** Close stdin and wait for the child to exit. */
  close(): Promise<void>
  /** Force-terminate the child process. */
  kill(): void
}

/**
 * Start a streaming Claude Code conversation.
 *
 * Resolves once the child has been spawned — the async iterable and promises
 * on the returned handle drive the rest of the lifecycle.
 */
export async function query(opts: QueryOptions): Promise<QueryHandle> {
  const args = argsFromOptions(opts)
  const stream = await spawnStream(args, {
    cwd: opts.cwd,
    env: opts.env,
    signal: opts.signal,
    cliPath: opts.cliPath,
  })

  const router = createControlRouter({
    onPermissionRequest: opts.onPermissionRequest,
    onControlRequest: opts.onControlRequest,
  })

  // ─── Fan-out plumbing ─────────────────────────────────────────────────────

  const eventQueue = new AsyncQueue<StreamLine>()
  const sessionId = deferred<string>()
  const resultPromise = deferred<QueryResult>()

  // Attach no-op catches immediately so Node doesn't treat a rejection that
  // lands before the caller's `await` as an unhandled rejection. The caller's
  // later `await handle.result` / `await handle.sessionId` still observes the
  // error — attaching a handler doesn't consume it for other awaiters.
  sessionId.promise.catch(() => {})
  resultPromise.promise.catch(() => {})

  // Pump: single reader over the child's NDJSON stream. Runs until the
  // generator completes (child exited). Pump no longer rejects on its own —
  // the `stream.done()` handler below is the single source of truth for
  // "what happened at child exit".
  const pumpPromise = pump(stream, router, eventQueue, sessionId, resultPromise)
    .catch(err => {
      sessionId.reject(err)
      resultPromise.reject(err)
      eventQueue.fail(err)
    })

  // Push the initial user turn, if any. When we have an initial prompt and
  // the caller didn't explicitly opt into multi-turn, close stdin immediately
  // — the CLI's stream-json `--print` mode waits indefinitely for further
  // stdin input after emitting the `result` line, which would deadlock
  // callers that drain events in a straight `for await`. Callers driving the
  // stream manually via `handle.send()` must leave `prompt` undefined OR set
  // `keepStdinOpen: true` and own the `handle.close()` lifecycle.
  if (opts.prompt !== undefined) {
    writeUserTurn(stream, opts.prompt)
    if (!opts.keepStdinOpen) {
      stream.endInput()
    }
  }

  // Wire child exit into the result promise. This is the single place that
  // decides "did the query complete successfully?" after the child exits —
  // `finaliseNoResult` classifies the exit state with full stderr context.
  stream.done().then(async ({ exitCode, signal, stderr }) => {
    // Drain pump before deciding final state — avoids racing stdout 'end'
    // (which finishes pump) against child 'close' (which fires stream.done).
    await pumpPromise
    eventQueue.close()

    if (resultPromise.settled) return

    const err = finaliseNoResult(
      { exitCode, signal, stderr },
      args,
      opts.signal,
    )
    sessionId.reject(err)
    resultPromise.reject(err)
  }).catch(err => {
    // Defensive: stream.done() itself shouldn't throw, but if it does, route
    // the error into the same rejection channels so nothing is left dangling.
    sessionId.reject(err)
    resultPromise.reject(err)
    eventQueue.fail(err)
  })

  // ─── Public handle ────────────────────────────────────────────────────────

  return {
    sessionId: sessionId.promise,
    events: eventQueue,
    result: resultPromise.promise,

    send(text: string | UserInputMessage): void {
      writeUserTurn(stream, text)
    },

    interrupt(): void {
      stream.write({
        type: 'control_request',
        request_id: `wrapper-interrupt-${Date.now()}`,
        request: { subtype: 'interrupt' },
      })
    },

    async close(): Promise<void> {
      stream.endInput()
      await stream.done()
      await pumpPromise
    },

    kill(): void {
      stream.kill('SIGTERM')
    },
  }
}

// ─── Internals ───────────────────────────────────────────────────────────────

/** Normalise a caller-supplied turn to the NDJSON user-message shape. */
function writeUserTurn(stream: StreamHandle, turn: string | UserInputMessage): void {
  if (typeof turn === 'string') {
    stream.write({
      type: 'user',
      message: { role: 'user', content: turn },
      parent_tool_use_id: null,
    } satisfies UserInputMessage)
    return
  }
  stream.write(turn)
}

/**
 * Drain the child's NDJSON stream, dispatching control requests, forwarding
 * everything else to the event queue, and resolving sessionId / result at
 * the appropriate moments.
 *
 * Uses a discriminator switch on `KnownStreamLine` so narrowing is exhaustive
 * without casts. Any `line.type` value not in the known set falls through to
 * the default branch and is forwarded to the queue as an `UnknownLine` — the
 * CLI can add new types without crashing the pump.
 */
async function pump(
  stream: StreamHandle,
  router: ReturnType<typeof createControlRouter>,
  eventQueue: AsyncQueue<StreamLine>,
  sessionId: Deferred<string>,
  resultPromise: Deferred<QueryResult>,
): Promise<void> {
  for await (const decoded of stream.lines) {
    if (!decoded.ok) {
      // Keep the conversation alive on a single malformed line — emit a
      // protocol error event that callers can observe if they want to.
      eventQueue.push({
        type: '__parse_error',
        raw: decoded.raw,
        error: decoded.error.message,
      } as unknown as StreamLine)
      continue
    }

    const line = decoded.value as KnownStreamLine

    switch (line.type) {
      case 'control_request': {
        // Handled entirely inside the router; never surfaced to the caller.
        const response = await router.handle(line)
        stream.write(response)
        continue
      }

      case 'control_cancel_request':
      case 'control_response':
      case 'keep_alive':
        // Swallowed — not interesting to the public event iterator.
        continue

      case 'system':
        // First `system/init` gives us the session id. Resolve once.
        if (line.subtype === 'init' && line.session_id && !sessionId.settled) {
          sessionId.resolve(line.session_id)
        }
        break

      case 'result':
        handleResult(line, resultPromise)
        break

      default:
        // user / assistant / stream_event / tool_progress / rate_limit_event
        // / tool_use_summary / unknown passthrough. Nothing special to do;
        // fall through to the queue push below.
        break
    }

    eventQueue.push(line)
  }

  // Note: we intentionally do NOT reject the result promise here. The
  // `stream.done()` handler in `query()` is the single source of truth for
  // "stream ended" — it has access to exit code, signal, and stderr, so it
  // can produce a richer error than pump can from inside the read loop.
}

/**
 * Decide what happened when the child exits WITHOUT having emitted a
 * `{type:'result'}` line. Classifies the exit state and produces a typed
 * error suitable for rejecting `sessionId` / `resultPromise`.
 *
 * Exported for tests.
 */
export function finaliseNoResult(
  exitInfo: { exitCode: number; signal: NodeJS.Signals | null; stderr: string },
  args: readonly string[],
  abortSignal: AbortSignal | undefined,
): ClaudeCodeError {
  if (abortSignal?.aborted) {
    return new ClaudeAbortError(abortSignal.reason)
  }
  if (exitInfo.exitCode !== 0) {
    return new ClaudeExitError(exitInfo.exitCode, exitInfo.signal, exitInfo.stderr, args)
  }
  // Clean exit but no result line — legitimate CLI behaviour for some
  // control_request paths (e.g. `end_session`), but still an error from the
  // caller's perspective. Include stderr tail so future occurrences are
  // actually diagnosable.
  const tail = exitInfo.stderr ? exitInfo.stderr.trim().slice(-500) : ''
  return new ClaudeProtocolError(
    `child stream ended without a result line${tail ? `: ${tail}` : ''}`,
  )
}

/**
 * Known `result.subtype` values from the leaked Claude Code source —
 * `src/entrypoints/sdk/coreSchemas.ts`. Anything outside this set is a
 * protocol violation and the caller should know about it rather than
 * silently resolving with empty text.
 */
const KNOWN_RESULT_SUBTYPES = new Set<string>([
  'success',
  'error_during_execution',
  'error_max_turns',
  'error_max_budget_usd',
  'error_max_structured_output_retries',
])

function handleResult(raw: ResultLine, resultPromise: Deferred<QueryResult>): void {
  if (resultPromise.settled) return

  if (!KNOWN_RESULT_SUBTYPES.has(raw.subtype)) {
    resultPromise.reject(
      new ClaudeProtocolError(`unknown result subtype "${raw.subtype}"`),
    )
    return
  }

  if (raw.subtype === 'success') {
    resultPromise.resolve(normaliseResult(raw))
    return
  }

  resultPromise.reject(
    new ClaudeResultError(raw.subtype, raw.errors ?? [], raw.session_id),
  )
}

function normaliseResult(raw: ResultLine): QueryResult {
  return {
    sessionId: raw.session_id ?? '',
    text: raw.result ?? '',
    durationMs: raw.duration_ms ?? 0,
    numTurns: raw.num_turns ?? 0,
    totalCostUsd: raw.total_cost_usd ?? 0,
    usage: raw.usage as Record<string, unknown> | undefined,
    structuredOutput: raw.structured_output,
    permissionDenials: (raw.permission_denials ?? []) as Array<Record<string, unknown>>,
    raw,
  }
}

// ─── Tiny async primitives ───────────────────────────────────────────────────

/** A promise with externally-callable resolve/reject + a `settled` flag. */
interface Deferred<T> {
  readonly promise: Promise<T>
  resolve(value: T): void
  reject(reason: unknown): void
  readonly settled: boolean
}

function deferred<T>(): Deferred<T> {
  let resolveFn!: (v: T) => void
  let rejectFn!: (r: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolveFn = res; rejectFn = rej })
  const box = {
    promise,
    settled: false,
    resolve(value: T) {
      if (box.settled) return
      box.settled = true
      resolveFn(value)
    },
    reject(reason: unknown) {
      if (box.settled) return
      box.settled = true
      rejectFn(reason)
    },
  }
  return box
}

/**
 * Single-producer, single-consumer async queue usable as AsyncIterable.
 *
 * Backed by a ring of resolved values + a waiters queue. Producers call
 * `push` / `close` / `fail`. Consumers iterate once via `for await`.
 */
class AsyncQueue<T> implements AsyncIterable<T> {
  private readonly values: T[] = []
  private readonly waiters: Array<(r: IteratorResult<T>) => void> = []
  private closed = false
  private failure: unknown = null

  push(value: T): void {
    if (this.closed) return
    const waiter = this.waiters.shift()
    if (waiter) waiter({ value, done: false })
    else this.values.push(value)
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    while (this.waiters.length) {
      this.waiters.shift()!({ value: undefined as unknown as T, done: true })
    }
  }

  fail(err: unknown): void {
    this.failure = err
    this.close()
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        if (this.failure) return Promise.reject(this.failure)
        if (this.values.length) {
          return Promise.resolve({ value: this.values.shift()!, done: false })
        }
        if (this.closed) return Promise.resolve({ value: undefined as unknown as T, done: true })
        return new Promise<IteratorResult<T>>(resolve => this.waiters.push(resolve))
      },
      return: () => Promise.resolve({ value: undefined as unknown as T, done: true }),
    }
  }
}
