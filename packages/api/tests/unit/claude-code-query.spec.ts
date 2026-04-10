/**
 * Tests for the `finaliseNoResult` helper — the single point in `query.ts`
 * that classifies a child-exit-without-a-result into a typed error.
 *
 * The real regression this guards against is an unhandled-rejection crash
 * that hit the API server: `pump()` used to reject directly from inside
 * its read loop before any caller had attached a `.catch`, and the fatal
 * `unhandledRejection` handler in `server.ts` called `process.exit(1)`.
 * The fix was two-fold:
 *  1. attach silent `.catch(() => {})` handlers to the deferred promises
 *     in `query()` so Node never sees them as unhandled
 *  2. consolidate the "stream ended" decision into `stream.done()`'s
 *     callback where stderr is available, via `finaliseNoResult`.
 *
 * These tests cover the decision matrix for (2). The silent-catch behaviour
 * in (1) is impractical to test deterministically without a real child
 * process, but the consolidated logic is pure and fully testable.
 */

import {
  ClaudeAbortError,
  ClaudeExitError,
  ClaudeProtocolError,
} from '@/services/claude-code/errors'
import { finaliseNoResult, query } from '@/services/claude-code/query'
import type { StreamHandle } from '@/services/claude-code/runner'
import type { DecodedLine } from '@/services/claude-code/ndjson'

vi.mock('@/services/claude-code/runner', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/claude-code/runner')>()
  return {
    ...actual,
    spawnStream: vi.fn(),
  }
})

import { spawnStream } from '@/services/claude-code/runner'

describe('finaliseNoResult', () => {
  const args = ['--print', '--input-format', 'stream-json'] as const

  describe('clean exit (code 0) without a result line', () => {
    it('returns ClaudeProtocolError', () => {
      const err = finaliseNoResult({ exitCode: 0, signal: null, stderr: '' }, args, undefined)
      expect(err).toBeInstanceOf(ClaudeProtocolError)
      expect(err.code).toBe('PROTOCOL_ERROR')
    })

    it('includes stderr tail in the error message when stderr is non-empty', () => {
      const stderr = 'something went wrong\nwith an explanation'
      const err = finaliseNoResult({ exitCode: 0, signal: null, stderr }, args, undefined)
      expect(err.message).toContain('child stream ended without a result line')
      expect(err.message).toContain('something went wrong')
      expect(err.message).toContain('with an explanation')
    })

    it('omits the ": " suffix when stderr is empty', () => {
      const err = finaliseNoResult({ exitCode: 0, signal: null, stderr: '' }, args, undefined)
      expect(err.message).toBe('Claude stream-json protocol error: child stream ended without a result line')
    })

    it('trims stderr before embedding', () => {
      const err = finaliseNoResult({ exitCode: 0, signal: null, stderr: '\n\noops\n\n' }, args, undefined)
      expect(err.message).toContain(': oops')
      expect(err.message).not.toContain('\n\noops')
    })

    it('truncates very long stderr to the last 500 bytes', () => {
      const long = 'x'.repeat(1000) + 'tail-marker'
      const err = finaliseNoResult({ exitCode: 0, signal: null, stderr: long }, args, undefined)
      expect(err.message).toContain('tail-marker')
      // The error prefix is fixed, so the total length is prefix + 500 + slack.
      expect(err.message.length).toBeLessThan(700)
    })
  })

  describe('non-zero exit', () => {
    it('returns ClaudeExitError carrying the exit code + stderr + args', () => {
      const err = finaliseNoResult(
        { exitCode: 2, signal: null, stderr: 'fatal: bad config' },
        args,
        undefined,
      )
      expect(err).toBeInstanceOf(ClaudeExitError)
      expect(err.code).toBe('EXIT_NONZERO')
      const asExit = err as ClaudeExitError
      expect(asExit.exitCode).toBe(2)
      expect(asExit.stderr).toContain('fatal: bad config')
      expect(asExit.args).toEqual(args)
    })

    it('preserves the signal field when the child was killed', () => {
      const err = finaliseNoResult(
        { exitCode: -1, signal: 'SIGTERM', stderr: '' },
        args,
        undefined,
      )
      expect(err).toBeInstanceOf(ClaudeExitError)
      expect((err as ClaudeExitError).signal).toBe('SIGTERM')
    })
  })

  describe('abort signal', () => {
    it('returns ClaudeAbortError when the abort signal is set, regardless of exit code', () => {
      const controller = new AbortController()
      controller.abort('user cancelled')
      const err = finaliseNoResult(
        { exitCode: 0, signal: null, stderr: '' },
        args,
        controller.signal,
      )
      expect(err).toBeInstanceOf(ClaudeAbortError)
      expect(err.code).toBe('ABORTED')
    })

    it('abort takes precedence over a non-zero exit code', () => {
      // If the child got killed as part of an abort, the exit code will be
      // non-zero but the real cause is the abort — report ClaudeAbortError.
      const controller = new AbortController()
      controller.abort()
      const err = finaliseNoResult(
        { exitCode: 143, signal: 'SIGTERM', stderr: 'Terminated' },
        args,
        controller.signal,
      )
      expect(err).toBeInstanceOf(ClaudeAbortError)
    })

    it('ignores a non-aborted signal (treats it as clean exit)', () => {
      const controller = new AbortController()
      const err = finaliseNoResult(
        { exitCode: 0, signal: null, stderr: '' },
        args,
        controller.signal,
      )
      expect(err).toBeInstanceOf(ClaudeProtocolError)
    })
  })
})

// ─── query() end-to-end plumbing with a mocked StreamHandle ─────────────────
// Regression coverage for the stdin-EOF deadlock: before the fix, providing
// an initial `prompt` would write the turn but never close stdin, so the CLI
// sat idle after emitting the `result` line, the pump's stdout `for await`
// never terminated, and the consumer's drain loop hung on iteration #4.

/** Build a fake StreamHandle backed by a manual line queue. */
function makeMockStream() {
  const writes: unknown[] = []
  let endInputCalls = 0
  let killed = false

  // Queue of lines to feed into the pump. `null` marks end-of-stream.
  const queue: Array<DecodedLine | null> = []
  const waiters: Array<(v: IteratorResult<DecodedLine>) => void> = []

  const pushLine = (line: DecodedLine | null) => {
    const waiter = waiters.shift()
    if (waiter) {
      if (line === null) waiter({ value: undefined as unknown as DecodedLine, done: true })
      else waiter({ value: line, done: false })
    } else {
      queue.push(line)
    }
  }

  const lines: AsyncIterable<DecodedLine> = {
    [Symbol.asyncIterator]() {
      return {
        next: () => {
          if (queue.length > 0) {
            const next = queue.shift()!
            if (next === null) return Promise.resolve({ value: undefined as unknown as DecodedLine, done: true })
            return Promise.resolve({ value: next, done: false })
          }
          return new Promise<IteratorResult<DecodedLine>>(resolve => waiters.push(resolve))
        },
      }
    },
  }

  let exitResolve: ((v: { exitCode: number; signal: null; stderr: string }) => void) | null = null
  const exitPromise = new Promise<{ exitCode: number; signal: null; stderr: string }>(resolve => {
    exitResolve = resolve
  })

  const handle: StreamHandle = {
    child: {} as StreamHandle['child'],
    lines,
    write(value: unknown) {
      writes.push(value)
    },
    endInput() {
      endInputCalls++
      // Simulate the CLI's reaction to EOF: flush any queued lines then end.
      // (In the tests below we preload the queue before the consumer drains.)
      pushLine(null)
      exitResolve?.({ exitCode: 0, signal: null, stderr: '' })
    },
    done() {
      return exitPromise
    },
    kill() {
      killed = true
    },
  }

  return {
    handle,
    writes,
    get endInputCalls() { return endInputCalls },
    get killed() { return killed },
    /** Enqueue a well-formed decoded line for the pump to consume. */
    pushEvent(line: unknown) {
      pushLine({ ok: true, value: line })
    },
    /** Force the stream to end without the caller calling endInput (multi-turn path). */
    forceExit() {
      pushLine(null)
      exitResolve?.({ exitCode: 0, signal: null, stderr: '' })
    },
  }
}

describe('query() — stdin EOF handling (single-turn default)', () => {
  beforeEach(() => {
    vi.mocked(spawnStream).mockReset()
  })

  it('closes stdin after writing the initial prompt (no deadlock)', async () => {
    const mock = makeMockStream()
    vi.mocked(spawnStream).mockResolvedValue(mock.handle)

    // Preload the 3 events the CLI would emit in response to a simple turn.
    mock.pushEvent({ type: 'system', subtype: 'init', session_id: 'sess-1' })
    mock.pushEvent({ type: 'assistant', message: { role: 'assistant', content: [] } })
    mock.pushEvent({
      type: 'result',
      subtype: 'success',
      session_id: 'sess-1',
      result: 'hi there',
      duration_ms: 42,
    })

    const handle = await query({ prompt: 'hi' })

    // Initial user turn was written.
    expect(mock.writes).toHaveLength(1)
    expect((mock.writes[0] as { type: string }).type).toBe('user')

    // CRITICAL: stdin was EOF'd immediately after the initial write.
    expect(mock.endInputCalls).toBe(1)

    // Consumer drain — must terminate, not hang.
    const received: string[] = []
    for await (const ev of handle.events) {
      received.push((ev as { type: string }).type)
    }
    expect(received).toEqual(['system', 'assistant', 'result'])

    // Result promise resolved with the normalised payload.
    const result = await handle.result
    expect(result.sessionId).toBe('sess-1')
    expect(result.text).toBe('hi there')
    expect(result.durationMs).toBe(42)
  })

  it('does NOT close stdin when keepStdinOpen: true (multi-turn opt-in)', async () => {
    const mock = makeMockStream()
    vi.mocked(spawnStream).mockResolvedValue(mock.handle)

    const handle = await query({ prompt: 'hi', keepStdinOpen: true })

    // Initial turn written, but stdin left open for send() / close().
    expect(mock.writes).toHaveLength(1)
    expect(mock.endInputCalls).toBe(0)

    // Caller-side cleanup: explicit close() EOFs stdin.
    mock.pushEvent({ type: 'system', subtype: 'init', session_id: 'sess-2' })
    mock.pushEvent({
      type: 'result',
      subtype: 'success',
      session_id: 'sess-2',
      result: 'bye',
    })
    await handle.close()

    expect(mock.endInputCalls).toBe(1)
  })

  it('does not write a turn or close stdin when no prompt is provided', async () => {
    const mock = makeMockStream()
    vi.mocked(spawnStream).mockResolvedValue(mock.handle)

    const handle = await query({})

    expect(mock.writes).toHaveLength(0)
    expect(mock.endInputCalls).toBe(0)

    // Force an exit so the test doesn't leak open handles.
    mock.forceExit()
    await handle.close()
  })
})
