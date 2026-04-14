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
  /**
   * Override the env passed to the child. Defaults to a copy of `process.env`
   * with `ANTHROPIC_API_KEY` removed so the CLI uses its own stored auth
   * (`claude auth login`) instead of an env-var key meant for the server's
   * LLM client. Pass an explicit object if you want no scrubbing — the
   * helper assumes you know what you're doing and does not post-process it.
   */
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
  /**
   * Override the env passed to the child. Defaults to a copy of `process.env`
   * with `ANTHROPIC_API_KEY` removed so the CLI uses its own stored auth
   * (`claude auth login`) instead of an env-var key meant for the server's
   * LLM client. Pass an explicit object if you want no scrubbing — the
   * helper assumes you know what you're doing and does not post-process it.
   */
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

// ─── Env scrubbing ───────────────────────────────────────────────────────────

/**
 * Build the environment for a spawned Claude CLI child process.
 *
 * The API server auto-loads `packages/api/.env` via `dotenv/config`, which
 * populates `ANTHROPIC_API_KEY` for the server's own LLM client
 * (`services/llm.ts`). The Claude CLI treats env-var API keys as an
 * "external" credential and prefers them over the user's stored
 * `claude auth login` session — so without this scrub, every CLI
 * subprocess we spawn would try to authenticate with the llm.ts key and
 * fail with "Invalid API key · Fix external API key".
 *
 * If the caller explicitly passes an `env` override, we assume they know
 * what they're doing (e.g. an integration test or a truly external key)
 * and leave it untouched.
 *
 * Exported for direct unit testing — testing via the real `spawn()` path
 * would require mocking `child_process`, which is needlessly heavy for a
 * pure function.
 */
export function buildChildEnv(override?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ...override }
  delete env.ANTHROPIC_API_KEY

  // Disable the CLI's tool-search / deferred-tool feature. Claude Code's
  // tool-search mode ships enabled by default — see leaked source at
  //   packages/claude-code/src/utils/toolSearch.ts:197
  //     `return 'tst' // default: always defer MCP and shouldDefer tools`
  // — and it hides every tool tagged `shouldDefer: true` from Claude's
  // initial tool list until ToolSearchTool has already emitted a prior
  // `tool_reference` block discovering it. On the first turn of a fresh
  // plan-mode session no such prior discoveries exist, so `ExitPlanMode`
  // (which has `shouldDefer: true` at
  //   packages/claude-code/src/tools/ExitPlanModeTool/ExitPlanModeV2Tool.ts:166
  // ) never appears in Claude's tools list. Claude reads the plan-mode
  // system reminder telling it to call ExitPlanMode but can't, falls
  // back to prose — "Would you like me to proceed with the
  // implementation?" — and bypasses our plan-approval flow in chat.ts's
  // onPermissionRequest closure entirely.
  //
  // AgentBuddy doesn't have the monster MCP tool counts tool search was
  // designed to optimise, so the feature is pure downside for us.
  // Setting `ENABLE_TOOL_SEARCH=0` hits the `isEnvDefinedFalsy` branch
  // at `toolSearch.ts:196` → forces mode to `'standard'` → makes
  // `useToolSearch = false` at `claude.ts:1120` → the `!useToolSearch`
  // path at `claude.ts:1168-1171` includes every tool (ExitPlanMode,
  // NotebookEdit, LSPTool, …) in Claude's effective tools list from
  // turn 1. Plan approval flow then works on the first try.
  env.ENABLE_TOOL_SEARCH = '0'

  return env
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
        env: buildChildEnv(opts.env),
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
      env: buildChildEnv(opts.env),
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
