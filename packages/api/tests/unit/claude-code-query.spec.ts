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
import { finaliseNoResult } from '@/services/claude-code/query'

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
