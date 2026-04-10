/**
 * Low-level process primitives for the Claude Code wrapper.
 *
 * Two flavours, because the CLI has two very different execution modes:
 *
 * 1. `execOnce` — one-shot subcommands (`claude mcp list`, `claude auth status`,
 *    …). Resolves when the child exits. Uses a bounded timeout. Translates
 *    spawn/exit errors into typed `ClaudeCodeError` subclasses.
 *
 * 2. `spawnStream` — long-lived `claude -p --input-format stream-json
 *    --output-format stream-json` for interactive conversations. Returns a
 *    handle the caller uses to push user turns (stdin) and iterate events
 *    (stdout) until the child exits. Abort via `AbortSignal`.
 *
 * Neither primitive knows anything about the wire protocol — they just move
 * bytes. The stream-json schema lives in `types.ts` and parsing in `ndjson.ts`.
 */

import {
  spawn,
  type ChildProcessByStdio,
  type ChildProcess,
} from 'child_process'
import type { Readable, Writable } from 'stream'

import { resolveForService } from '@/core/helpers/resolve-cli'

import { decodeNdjson, encodeNdjsonLine, type DecodedLine } from './ndjson'
import {
  ClaudeAbortError,
  ClaudeCliNotFoundError,
  ClaudeExitError,
  ClaudeTimeoutError,
} from './errors'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ExecOnceOptions {
  cwd?: string
  env?: NodeJS.ProcessEnv
  /** Bytes piped to stdin. Pass `undefined` to leave stdin closed. */
  input?: string
  /** Milliseconds until the child is SIGKILL'd and a ClaudeTimeoutError thrown. */
  timeoutMs?: number
  signal?: AbortSignal
  /** Override the resolved CLI path (primarily for testing). */
  cliPath?: string
}

export interface ExecOnceResult {
  stdout: string
  stderr: string
  exitCode: number
}

export interface SpawnStreamOptions {
  cwd?: string
  env?: NodeJS.ProcessEnv
  signal?: AbortSignal
  cliPath?: string
}

/** Handle returned by `spawnStream`. Close when done. */
export interface StreamHandle {
  readonly child: ChildProcess
  /** Parsed NDJSON lines from stdout. Completes when the child exits. */
  readonly lines: AsyncIterable<DecodedLine>
  /** Write one JSON value as a framed NDJSON line to stdin. */
  write(value: unknown): void
  /** Close stdin (signals end-of-input to the CLI). */
  endInput(): void
  /** Wait for the child to exit. Resolves with the exit code. */
  done(): Promise<{ exitCode: number; signal: NodeJS.Signals | null; stderr: string }>
  /** Forcefully kill the child. */
  kill(signal?: NodeJS.Signals): void
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Run the Claude CLI once, return its captured stdout/stderr.
 *
 * Use this for subcommands that print JSON or text and exit. For streaming
 * conversations use `spawnStream` instead.
 */
export async function execOnce(
  args: readonly string[],
  opts: ExecOnceOptions = {},
): Promise<ExecOnceResult> {
  const cliPath = opts.cliPath ?? await resolveForService('claude-code')
  const timeoutMs = opts.timeoutMs ?? 30_000

  return new Promise<ExecOnceResult>((resolve, reject) => {
    let child: ChildProcess
    try {
      child = spawn(cliPath, args as string[], {
        cwd: opts.cwd,
        env: opts.env ?? process.env,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    } catch (err) {
      reject(wrapSpawnError(err, cliPath))
      return
    }

    const chunksOut: Buffer[] = []
    const chunksErr: Buffer[] = []
    let settled = false

    const settle = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      opts.signal?.removeEventListener('abort', onAbort)
      fn()
    }

    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      settle(() => reject(new ClaudeTimeoutError(timeoutMs, args)))
    }, timeoutMs)

    const onAbort = () => {
      child.kill('SIGTERM')
      settle(() => reject(new ClaudeAbortError(opts.signal?.reason)))
    }
    if (opts.signal) {
      if (opts.signal.aborted) {
        onAbort()
        return
      }
      opts.signal.addEventListener('abort', onAbort, { once: true })
    }

    child.stdout?.on('data', c => chunksOut.push(c))
    child.stderr?.on('data', c => chunksErr.push(c))

    child.on('error', err => settle(() => reject(wrapSpawnError(err, cliPath))))

    child.on('close', (code, signal) => {
      const stdout = Buffer.concat(chunksOut).toString('utf8')
      const stderr = Buffer.concat(chunksErr).toString('utf8')
      if (code === 0) {
        settle(() => resolve({ stdout, stderr, exitCode: 0 }))
      } else {
        settle(() => reject(new ClaudeExitError(code, signal, stderr, args)))
      }
    })

    if (opts.input !== undefined && child.stdin) {
      child.stdin.end(opts.input)
    } else {
      child.stdin?.end()
    }
  })
}

/**
 * Spawn the CLI for a long-lived streaming conversation.
 *
 * The caller drives the lifecycle: write stdin turns, iterate `lines`, then
 * call `endInput()` and `await done()`. If `signal` aborts, the child is
 * SIGTERM'd and `done()` rejects with `ClaudeAbortError`.
 */
export async function spawnStream(
  args: readonly string[],
  opts: SpawnStreamOptions = {},
): Promise<StreamHandle> {
  const cliPath = opts.cliPath ?? await resolveForService('claude-code')

  let child: ChildProcessByStdio<Writable, Readable, Readable>
  try {
    child = spawn(cliPath, args as string[], {
      cwd: opts.cwd,
      env: opts.env ?? process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    }) as ChildProcessByStdio<Writable, Readable, Readable>
  } catch (err) {
    throw wrapSpawnError(err, cliPath)
  }

  // Collect stderr lazily for post-mortem on exit.
  const stderrChunks: Buffer[] = []
  child.stderr.on('data', c => stderrChunks.push(c))

  // One-shot promise that resolves on exit. Cached so multiple `done()`
  // calls are idempotent.
  const exitPromise = new Promise<{ exitCode: number; signal: NodeJS.Signals | null; stderr: string }>(
    (resolve, reject) => {
      child.once('error', err => reject(wrapSpawnError(err, cliPath)))
      child.once('close', (code, sig) => {
        resolve({
          exitCode: code ?? -1,
          signal: sig,
          stderr: Buffer.concat(stderrChunks).toString('utf8'),
        })
      })
    },
  )

  // Honour external abort by SIGTERM'ing the child. The exit handler above
  // turns that into a normal resolve with a non-zero exit code; callers of
  // `done()` can classify it themselves.
  if (opts.signal) {
    if (opts.signal.aborted) {
      child.kill('SIGTERM')
    } else {
      opts.signal.addEventListener('abort', () => child.kill('SIGTERM'), { once: true })
    }
  }

  return {
    child,
    lines: decodeNdjson(child.stdout),
    write(value: unknown): void {
      if (!child.stdin.writable) return
      child.stdin.write(encodeNdjsonLine(value))
    },
    endInput(): void {
      if (child.stdin.writable) child.stdin.end()
    },
    done(): Promise<{ exitCode: number; signal: NodeJS.Signals | null; stderr: string }> {
      return exitPromise
    },
    kill(signal: NodeJS.Signals = 'SIGTERM'): void {
      child.kill(signal)
    },
  }
}

// ─── Internals ───────────────────────────────────────────────────────────────

function wrapSpawnError(err: unknown, cliPath: string): Error {
  const e = err as NodeJS.ErrnoException
  if (e?.code === 'ENOENT' || e?.code === 'EACCES') {
    return new ClaudeCliNotFoundError(cliPath, err)
  }
  return err instanceof Error ? err : new Error(String(err))
}
