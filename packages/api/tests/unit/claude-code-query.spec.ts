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
// Regression coverage for the stdin-EOF deadlock AND its follow-up fix: the
// original deadlock was "never closing stdin", which left the CLI waiting
// for more input after emitting `result`. The naive fix was to close stdin
// synchronously right after writing the user turn — which worked for the
// deadlock but broke the bidirectional stdio permission flow (the CLI sees
// stdin EOF before it needs to ask for permission and either silently
// drops our response writes or short-circuits to its non-interactive
// fallback without emitting `can_use_tool` at all). The actual fix is to
// defer `stream.endInput()` until the `resultPromise` settles, so stdin
// stays writable during the turn and closes only after the CLI has
// emitted its terminal `result` line. These tests pin down that timing.

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

  it('closes stdin AFTER the turn completes — not synchronously on write', async () => {
    // CRITICAL invariant for the stdio permission flow: stdin must stay
    // writable while the pump is draining events, so any intermediate
    // `control_request { subtype: 'can_use_tool' }` can round-trip a
    // response back to the CLI. F1' moves the `stream.endInput()` call
    // from "immediately after writeUserTurn" to "after resultPromise
    // settles", which this test pins down.
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

    // Two writes: [0] = initialize control_request (SDK handshake),
    // [1] = user turn. Initialize is sent unconditionally at spawn time
    // so the CLI's stdio permission flow knows we're an SDK host.
    expect(mock.writes).toHaveLength(2)
    expect((mock.writes[0] as { type: string; request: { subtype: string } }).type).toBe('control_request')
    expect((mock.writes[0] as { type: string; request: { subtype: string } }).request.subtype).toBe('initialize')
    expect((mock.writes[1] as { type: string }).type).toBe('user')

    // CRITICAL: stdin is NOT yet closed — the turn hasn't begun draining.
    // This is the guard the old test got wrong: the old implementation
    // would fire endInput synchronously here, which was the bug.
    expect(mock.endInputCalls).toBe(0)

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

    // After the result promise settles, the deferred autoClose fires and
    // stdin is finally EOF'd — flip the CLI into its clean exit path.
    // Wait a microtask for the `.then` callback to run.
    await Promise.resolve()
    expect(mock.endInputCalls).toBe(1)
  })

  it('does NOT close stdin when keepStdinOpen: true (multi-turn opt-in)', async () => {
    const mock = makeMockStream()
    vi.mocked(spawnStream).mockResolvedValue(mock.handle)

    const handle = await query({ prompt: 'hi', keepStdinOpen: true })

    // Two writes: initialize + user turn. stdin is left open for
    // send() / close() since the caller opted into multi-turn.
    expect(mock.writes).toHaveLength(2)
    expect((mock.writes[0] as { type: string }).type).toBe('control_request')
    expect((mock.writes[1] as { type: string }).type).toBe('user')
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

  it('sends only the initialize handshake when no prompt is provided', async () => {
    const mock = makeMockStream()
    vi.mocked(spawnStream).mockResolvedValue(mock.handle)

    const handle = await query({})

    // One write: the initialize control_request. No user turn because
    // the caller didn't pass `prompt` (multi-turn via send() mode).
    expect(mock.writes).toHaveLength(1)
    expect((mock.writes[0] as { type: string; request: { subtype: string } }).type).toBe('control_request')
    expect((mock.writes[0] as { type: string; request: { subtype: string } }).request.subtype).toBe('initialize')
    expect(mock.endInputCalls).toBe(0)

    // Force an exit so the test doesn't leak open handles.
    mock.forceExit()
    await handle.close()
  })
})

// ─── query() permission round-trip — end-to-end through the pump + router ───
// These tests simulate the CLI emitting a `control_request` with
// `subtype: 'can_use_tool'` and verify every hop in the chain:
//   1. pump receives the line and routes it to the router
//   2. router dispatches to `onPermissionRequest`
//   3. the permission handler's decision is shaped into a control_response
//   4. pump writes the response back to stdin via `stream.write`
//   5. the permission line is NOT surfaced to the consumer's event iterator
//
// The user-visible symptom that prompted these tests: Claude Code tool calls
// like `Edit` silently fail with "please approve in your terminal" prose
// instead of firing the in-chat approval block. The hypothesis is that
// either (a) the CLI isn't emitting `can_use_tool` at all (argv / SDK-host
// handshake issue), or (b) the wrapper is dropping / mis-routing the line.
// These tests pin down (b) — if the chain is broken somewhere in our
// wrapper, these tests will fail. If they pass, (b) is ruled out and the
// investigation moves upstream to the CLI subprocess itself.

describe('query() — permission flow round-trip (pump + router + handler)', () => {
  beforeEach(() => {
    vi.mocked(spawnStream).mockReset()
  })

  /** Shape-typed helper for mock.writes entries. */
  type ControlResponseWrite = {
    type: 'control_response'
    response: {
      subtype: 'success' | 'error'
      request_id: string
      response?: unknown
      error?: string
    }
  }
  function isControlResponseWrite(w: unknown): w is ControlResponseWrite {
    return !!w && typeof w === 'object' && (w as any).type === 'control_response'
  }

  it('routes can_use_tool to onPermissionRequest and writes an allow response back', async () => {
    const mock = makeMockStream()
    vi.mocked(spawnStream).mockResolvedValue(mock.handle)

    const handlerCalls: any[] = []
    const onPermissionRequest = async (req: any) => {
      handlerCalls.push(req)
      return { behavior: 'allow' as const }
    }

    // Preload the sequence a real CLI would emit for a single tool use:
    //   1. system/init  (session start)
    //   2. assistant    (Claude announces the tool call in its content blocks)
    //   3. control_request (can_use_tool — "may I run Edit on foo.ts?")
    //   4. result       (turn complete)
    // The control_request is what our wrapper must handle. If the chain
    // breaks, the handler won't fire OR the response won't be written.
    mock.pushEvent({ type: 'system', subtype: 'init', session_id: 'sess-perm-1' })
    mock.pushEvent({
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'tu-edit-1',
            name: 'Edit',
            input: { file_path: 'foo.ts', old_string: 'a', new_string: 'b' },
          },
        ],
      },
    })
    mock.pushEvent({
      type: 'control_request',
      request_id: 'req-can-use-1',
      request: {
        subtype: 'can_use_tool',
        tool_name: 'Edit',
        input: { file_path: 'foo.ts', old_string: 'a', new_string: 'b' },
        tool_use_id: 'tu-edit-1',
      },
    })
    mock.pushEvent({
      type: 'result',
      subtype: 'success',
      session_id: 'sess-perm-1',
      result: 'done',
      duration_ms: 50,
    })

    const handle = await query({
      prompt: 'edit the file',
      onPermissionRequest,
    })

    // Drain the consumer event iterator. Only init / assistant / result
    // should surface — control_request is handled internally by the pump
    // and must never reach the consumer.
    const received: string[] = []
    for await (const ev of handle.events) {
      received.push((ev as { type: string }).type)
    }
    expect(received).toEqual(['system', 'assistant', 'result'])

    // ─── Step 1: the handler fired exactly once with the right payload ─
    expect(handlerCalls).toHaveLength(1)
    expect(handlerCalls[0].subtype).toBe('can_use_tool')
    expect(handlerCalls[0].tool_name).toBe('Edit')
    expect(handlerCalls[0].tool_use_id).toBe('tu-edit-1')
    expect(handlerCalls[0].input).toEqual({
      file_path: 'foo.ts',
      old_string: 'a',
      new_string: 'b',
    })

    // ─── Step 2: a control_response was written back via stream.write ──
    // Writes so far: [0]=initialize, [1]=user turn, [2]=control_response.
    const responseWrites = mock.writes.filter(isControlResponseWrite)
    expect(responseWrites).toHaveLength(1)
    const resp = responseWrites[0]
    expect(resp.response.subtype).toBe('success')
    expect(resp.response.request_id).toBe('req-can-use-1')
    expect(resp.response.response).toEqual({ behavior: 'allow' })

    // Sanity: the turn completed cleanly, result resolved.
    const result = await handle.result
    expect(result.sessionId).toBe('sess-perm-1')
    expect(result.text).toBe('done')
  })

  it('forwards a deny decision from the handler through to stream.write', async () => {
    const mock = makeMockStream()
    vi.mocked(spawnStream).mockResolvedValue(mock.handle)

    const onPermissionRequest = async (_req: any) => ({
      behavior: 'deny' as const,
      message: 'user clicked deny',
    })

    mock.pushEvent({ type: 'system', subtype: 'init', session_id: 'sess-perm-2' })
    mock.pushEvent({
      type: 'control_request',
      request_id: 'req-deny-1',
      request: {
        subtype: 'can_use_tool',
        tool_name: 'Bash',
        input: { command: 'rm -rf /' },
        tool_use_id: 'tu-bash-1',
      },
    })
    mock.pushEvent({
      type: 'result',
      subtype: 'success',
      session_id: 'sess-perm-2',
      result: 'denied',
      duration_ms: 10,
    })

    const handle = await query({
      prompt: 'dangerous op',
      onPermissionRequest,
    })
    for await (const _ev of handle.events) { /* drain */ }

    const responseWrites = mock.writes.filter(isControlResponseWrite)
    expect(responseWrites).toHaveLength(1)
    expect(responseWrites[0].response.subtype).toBe('success')
    expect(responseWrites[0].response.request_id).toBe('req-deny-1')
    expect(responseWrites[0].response.response).toEqual({
      behavior: 'deny',
      message: 'user clicked deny',
    })
  })

  it('defaults to deny when no onPermissionRequest is wired', async () => {
    // This is the "nothing's connected" baseline — if no handler is passed,
    // the control router at control.ts:88-93 returns
    // { behavior: 'deny', message: 'No permission handler configured' }.
    // This test guards against a regression where the wrapper silently
    // swallows can_use_tool requests (which would leave the CLI hanging
    // forever waiting for a response).
    const mock = makeMockStream()
    vi.mocked(spawnStream).mockResolvedValue(mock.handle)

    mock.pushEvent({ type: 'system', subtype: 'init', session_id: 'sess-perm-3' })
    mock.pushEvent({
      type: 'control_request',
      request_id: 'req-noop-1',
      request: {
        subtype: 'can_use_tool',
        tool_name: 'Edit',
        input: { file_path: 'foo.ts' },
        tool_use_id: 'tu-no-handler',
      },
    })
    mock.pushEvent({
      type: 'result',
      subtype: 'success',
      session_id: 'sess-perm-3',
      result: '',
    })

    const handle = await query({
      prompt: 'hi',
      // NOTE: no onPermissionRequest
    })
    for await (const _ev of handle.events) { /* drain */ }

    const responseWrites = mock.writes.filter(isControlResponseWrite)
    expect(responseWrites).toHaveLength(1)
    expect(responseWrites[0].response.subtype).toBe('success')
    expect((responseWrites[0].response.response as any).behavior).toBe('deny')
    expect((responseWrites[0].response.response as any).message).toBe(
      'No permission handler configured',
    )
  })

  it('passes through extra CLI fields on the can_use_tool request (schema is permissive)', async () => {
    // The leaked CLI source at src/cli/structuredIO.ts:590-606 emits
    // can_use_tool requests with extra optional fields: permission_suggestions,
    // blocked_path, decision_reason, agent_id, title, display_name, description.
    // Our ControlRequestLineSchema uses .passthrough() so unknown fields
    // survive — but that's worth a regression test because a single switch
    // to .strict() would silently drop control_requests and route them to
    // __parse_error, which the pump swallows.
    const mock = makeMockStream()
    vi.mocked(spawnStream).mockResolvedValue(mock.handle)

    const handlerCalls: any[] = []
    const onPermissionRequest = async (req: any) => {
      handlerCalls.push(req)
      return { behavior: 'allow' as const }
    }

    mock.pushEvent({ type: 'system', subtype: 'init', session_id: 'sess-perm-4' })
    mock.pushEvent({
      type: 'control_request',
      request_id: 'req-extras-1',
      request: {
        subtype: 'can_use_tool',
        tool_name: 'Edit',
        input: { file_path: 'foo.ts' },
        tool_use_id: 'tu-extras',
        // Fields the real CLI adds that our type interface doesn't explicitly list:
        permission_suggestions: [{ type: 'allow_once' }],
        blocked_path: '/etc/passwd',
        decision_reason: { type: 'mode', mode: 'default' },
        agent_id: 'agent-1',
        title: 'Allow Edit?',
        display_name: 'Edit file',
        description: 'The agent wants to modify foo.ts',
      },
    })
    mock.pushEvent({
      type: 'result',
      subtype: 'success',
      session_id: 'sess-perm-4',
      result: '',
    })

    const handle = await query({ prompt: 'edit', onPermissionRequest })
    for await (const _ev of handle.events) { /* drain */ }

    // Handler should receive the full request including the extra fields.
    expect(handlerCalls).toHaveLength(1)
    expect(handlerCalls[0].tool_name).toBe('Edit')
    expect(handlerCalls[0].blocked_path).toBe('/etc/passwd')
    expect(handlerCalls[0].title).toBe('Allow Edit?')
    expect(handlerCalls[0].description).toBe('The agent wants to modify foo.ts')
    expect(handlerCalls[0].permission_suggestions).toEqual([{ type: 'allow_once' }])

    // And a successful round-trip still fired.
    const responseWrites = mock.writes.filter(isControlResponseWrite)
    expect(responseWrites).toHaveLength(1)
    expect(responseWrites[0].response.request_id).toBe('req-extras-1')
  })

  it('handles multiple can_use_tool requests in one turn with matching request_ids', async () => {
    // A real turn can emit multiple tool calls that each need permission.
    // The router's dedupe key is `request_id`, so each distinct id must
    // round-trip independently with its own response.
    const mock = makeMockStream()
    vi.mocked(spawnStream).mockResolvedValue(mock.handle)

    const handlerCalls: any[] = []
    const onPermissionRequest = async (req: any) => {
      handlerCalls.push(req)
      // Alternating allow/deny based on tool name for easy assertions
      return req.tool_name === 'Edit'
        ? { behavior: 'allow' as const }
        : { behavior: 'deny' as const, message: 'bash is scary' }
    }

    mock.pushEvent({ type: 'system', subtype: 'init', session_id: 'sess-perm-5' })
    mock.pushEvent({
      type: 'control_request',
      request_id: 'req-multi-1',
      request: {
        subtype: 'can_use_tool',
        tool_name: 'Edit',
        input: { file_path: 'a.ts' },
        tool_use_id: 'tu-1',
      },
    })
    mock.pushEvent({
      type: 'control_request',
      request_id: 'req-multi-2',
      request: {
        subtype: 'can_use_tool',
        tool_name: 'Bash',
        input: { command: 'ls' },
        tool_use_id: 'tu-2',
      },
    })
    mock.pushEvent({
      type: 'result',
      subtype: 'success',
      session_id: 'sess-perm-5',
      result: '',
    })

    const handle = await query({ prompt: 'do stuff', onPermissionRequest })
    for await (const _ev of handle.events) { /* drain */ }

    expect(handlerCalls).toHaveLength(2)
    expect(handlerCalls[0].tool_name).toBe('Edit')
    expect(handlerCalls[1].tool_name).toBe('Bash')

    const responseWrites = mock.writes.filter(isControlResponseWrite)
    expect(responseWrites).toHaveLength(2)

    // Edit's response: allow
    const editResp = responseWrites.find(r => r.response.request_id === 'req-multi-1')
    expect(editResp?.response.response).toEqual({ behavior: 'allow' })

    // Bash's response: deny with message
    const bashResp = responseWrites.find(r => r.response.request_id === 'req-multi-2')
    expect(bashResp?.response.response).toEqual({
      behavior: 'deny',
      message: 'bash is scary',
    })
  })

  it('does NOT surface control_request lines to the consumer event iterator', async () => {
    // Regression guard: the pump's `case 'control_request'` branch calls
    // `continue` immediately after `stream.write(response)`, bypassing the
    // `eventQueue.push(line)` at the bottom of the loop. If a future edit
    // accidentally drops the `continue`, control_request lines would leak
    // into the public event iterator and break the consumer's assumption
    // that they only see user/assistant/stream_event/tool_progress/…
    const mock = makeMockStream()
    vi.mocked(spawnStream).mockResolvedValue(mock.handle)

    mock.pushEvent({ type: 'system', subtype: 'init', session_id: 'sess-leak' })
    mock.pushEvent({
      type: 'control_request',
      request_id: 'req-leak',
      request: {
        subtype: 'can_use_tool',
        tool_name: 'Edit',
        input: {},
        tool_use_id: 'tu-leak',
      },
    })
    mock.pushEvent({
      type: 'result',
      subtype: 'success',
      session_id: 'sess-leak',
      result: '',
    })

    const handle = await query({
      prompt: 'hi',
      onPermissionRequest: async () => ({ behavior: 'allow' as const }),
    })

    const received: string[] = []
    for await (const ev of handle.events) {
      received.push((ev as { type: string }).type)
    }

    // No 'control_request' entry in the consumer stream.
    expect(received).not.toContain('control_request')
    // But all the content types made it through.
    expect(received).toEqual(['system', 'result'])
  })

  it('forwards user-type lines carrying tool_result blocks to the consumer iterator', async () => {
    // Regression guard for the tool-execution-error channel. The CLI
    // reports every tool outcome (success or failure) via a `user`-role
    // message whose `message.content` is an array containing a
    // `tool_result` block with `tool_use_id`, optional `is_error`, and
    // `content` carrying either the result payload or a
    // `<tool_use_error>…</tool_use_error>` envelope.
    //
    // Before chat.ts grew a handler for these lines, failed Edit/Write
    // tools were silently flipped to 'ok' at finalise(), so the UI
    // showed a fake green checkmark for actual failures. This test
    // pins the wrapper-level contract: the pump MUST forward the full
    // user line (including `message.content`'s array shape and all
    // tool_result fields) to the consumer iterator so downstream
    // handlers can act on it. If this regresses, the chat.ts branch
    // won't receive anything to handle.
    const mock = makeMockStream()
    vi.mocked(spawnStream).mockResolvedValue(mock.handle)

    mock.pushEvent({ type: 'system', subtype: 'init', session_id: 'sess-tr-1' })
    mock.pushEvent({
      type: 'user',
      message: {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'toolu_edit_1',
            content: '<tool_use_error>String to replace not found in file.</tool_use_error>',
            is_error: true,
          },
        ],
      },
      parent_tool_use_id: null,
    })
    mock.pushEvent({
      type: 'result',
      subtype: 'success',
      session_id: 'sess-tr-1',
      result: '',
    })

    const handle = await query({ prompt: 'edit' })

    const received: Array<{ type: string; message?: unknown }> = []
    for await (const ev of handle.events) {
      received.push(ev as { type: string; message?: unknown })
    }

    // The user event with tool_result content survived the pump and
    // reached the consumer — chat.ts's branch can now act on it.
    const userEvt = received.find(e => e.type === 'user')
    expect(userEvt).toBeDefined()
    const content = (userEvt?.message as { content?: unknown[] })?.content
    expect(Array.isArray(content)).toBe(true)
    const toolResult = (content as Array<Record<string, unknown>>)[0]
    expect(toolResult.type).toBe('tool_result')
    expect(toolResult.is_error).toBe(true)
    expect(toolResult.tool_use_id).toBe('toolu_edit_1')
    expect(String(toolResult.content)).toContain('String to replace not found')
  })
})
