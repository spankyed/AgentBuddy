/**
 * Hermes Agent Bridge Client — manages the Python subprocess lifecycle.
 *
 * Spawns `hermes-bridge.py` as a child process and communicates via JSONL
 * over stdin/stdout. Provides both request/response and streaming APIs.
 *
 * Pattern: mirrors the claude-code runner.ts / query.ts split, but simplified
 * since we own both sides of the protocol.
 */

import { spawn, execSync, type ChildProcess } from 'child_process'
import { createInterface, type Interface } from 'readline'
import path from 'path'
import { createLogger } from '@/core/helpers/debug/logger'
import type { BridgeRequest, BridgeResponse, BridgeStatus, BridgeInfo, HermesConfig } from './types'

const logger = createLogger('hermes-bridge')

const BRIDGE_SCRIPT = path.join(process.cwd(), 'src', 'services', 'hermes', 'bridge', 'hermes-bridge.py')

// ─── Python Discovery ───────────────────────────────────────────────────────

function discoverPython(config: HermesConfig): string {
  if (config.pythonPath) return config.pythonPath

  // Check agent dir venvs first (they have the right deps installed)
  if (config.agentDir) {
    for (const venv of ['.venv', 'venv']) {
      const venvPy = path.join(config.agentDir, venv, 'bin', 'python')
      try { execSync(`test -f "${venvPy}"`, { timeout: 2000 }); return venvPy } catch {}
    }
  }

  for (const name of ['python3', 'python']) {
    try {
      const result = execSync(`which ${name}`, { encoding: 'utf8', timeout: 5000 }).trim()
      if (result) return result
    } catch {
      continue
    }
  }

  return 'python3'
}

// ─── Request/Response Correlation ───────────────────────────────────────────

type PendingCallback = {
  resolve: (data: Record<string, unknown>) => void
  reject: (error: Error) => void
  onEvent?: (type: string, data: Record<string, unknown>) => void
}

let _requestCounter = 0

function nextRequestId(): string {
  return `req-${++_requestCounter}-${Date.now()}`
}

// ─── Bridge Client ──────────────────────────────────────────────────────────

export class HermesBridgeClient {
  private process: ChildProcess | null = null
  private readline: Interface | null = null
  private pending = new Map<string, PendingCallback>()
  private _status: BridgeStatus = 'stopped'
  private _agentDir: string | null = null
  private _error: string | undefined
  private _config: HermesConfig
  private _readyResolve: ((info: BridgeInfo) => void) | null = null
  private _readyTimeout: ReturnType<typeof setTimeout> | null = null

  constructor(config: HermesConfig = {}) {
    this._config = config
  }

  get status(): BridgeStatus { return this._status }
  get info(): BridgeInfo {
    return {
      status: this._status,
      agentDir: this._agentDir,
      pid: this.process?.pid ?? null,
      error: this._error,
    }
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────

  async start(): Promise<BridgeInfo> {
    if (this.process && this._status === 'ready') {
      return this.info
    }

    this._status = 'starting'
    this._error = undefined

    const pythonPath = discoverPython(this._config)
    logger.info(`Starting Hermes bridge with Python: ${pythonPath}`)

    const env: Record<string, string> = { ...process.env } as Record<string, string>
    if (this._config.hermesHome) env.HERMES_HOME = this._config.hermesHome
    if (this._config.agentDir) env.HERMES_WEBUI_AGENT_DIR = this._config.agentDir
    if (this._config.apiKey) {
      // Scrub host keys only when user provides their own — otherwise let
      // the agent's native resolution (env vars, credential pools, config.yaml) work
      delete env.OPENAI_API_KEY
      delete env.ANTHROPIC_API_KEY
      delete env.OPENROUTER_API_KEY
      const p = (this._config.provider || 'openai').toLowerCase()
      if (p === 'anthropic') env.ANTHROPIC_API_KEY = this._config.apiKey
      else env.OPENAI_API_KEY = this._config.apiKey
    }

    this.process = spawn(pythonPath, [BRIDGE_SCRIPT], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env,
    })

    // Forward stderr to logger
    this.process.stderr?.on('data', (chunk: Buffer) => {
      const lines = chunk.toString().split('\n').filter(Boolean)
      for (const line of lines) {
        logger.debug(`[bridge-stderr] ${line}`)
      }
    })

    // Wait for ready message — set up the promise BEFORE attaching the
    // readline listener so the ready message can't be missed.
    const readyPromise = new Promise<BridgeInfo>((resolve, reject) => {
      this._readyResolve = resolve
      const timeout = setTimeout(() => {
        this._readyResolve = null
        reject(new Error('Bridge startup timed out (10s)'))
        this.stop()
      }, 10_000)

      // Store timeout for cleanup if ready arrives before timeout
      this._readyTimeout = timeout
    })

    // Parse JSONL from stdout — attached after readyPromise is set up
    this.readline = createInterface({ input: this.process.stdout! })
    this.readline.on('line', (line: string) => {
      this._handleLine(line)
    })

    // Handle process exit
    this.process.on('exit', (code, signal) => {
      logger.info(`Bridge process exited`, { code, signal })
      this._status = 'stopped'
      this.process = null
      this.readline = null

      // Reject all pending requests
      for (const [, cb] of this.pending) {
        cb.reject(new Error(`Bridge process exited (code=${code})`))
      }
      this.pending.clear()
    })

    this.process.on('error', (err) => {
      logger.error(`Bridge process error: ${err.message}`, { error: err })
      this._status = 'error'
      this._error = err.message
    })

    return readyPromise
  }

  async stop(): Promise<void> {
    if (!this.process) return

    logger.info(`Stopping bridge process`, { pid: this.process.pid })

    // Close stdin to signal graceful shutdown
    this.process.stdin?.end()

    // Give it 3s to exit, then SIGKILL
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        if (this.process) {
          logger.warn('Bridge did not exit gracefully, sending SIGKILL')
          this.process.kill('SIGKILL')
        }
        resolve()
      }, 3_000)

      this.process!.once('exit', () => {
        clearTimeout(timeout)
        resolve()
      })
    })

    this._status = 'stopped'
    this.process = null
    this.readline = null
  }

  async restart(): Promise<BridgeInfo> {
    await this.stop()
    return this.start()
  }

  updateConfig(config: Partial<HermesConfig>) {
    this._config = { ...this._config, ...config }
  }

  // ── Request/Response ──────────────────────────────────────────────────

  /**
   * Send a request and wait for the result response.
   * For non-streaming methods (listSessions, getMemory, etc.).
   */
  async send<T = Record<string, unknown>>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    if (this._status !== 'ready') {
      throw new Error(`Bridge not ready (status: ${this._status})`)
    }

    const id = nextRequestId()

    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: resolve as (data: Record<string, unknown>) => void,
        reject,
      })

      this._write({ id, method, params })

      // Timeout after 30s for non-streaming requests
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          reject(new Error(`Request timed out: ${method}`))
        }
      }, 30_000)
    })
  }

  /**
   * Send a streaming request. Calls `onEvent` for each streaming event,
   * resolves when the stream completes (done/error).
   */
  async sendStreaming(
    method: string,
    params: Record<string, unknown>,
    onEvent: (type: string, data: Record<string, unknown>) => void,
  ): Promise<Record<string, unknown>> {
    if (this._status !== 'ready') {
      throw new Error(`Bridge not ready (status: ${this._status})`)
    }

    const id = nextRequestId()

    return new Promise<Record<string, unknown>>((resolve, reject) => {
      this.pending.set(id, {
        resolve,
        reject,
        onEvent,
      })

      this._write({ id, method, params })

      // Streaming timeout: 10 minutes
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          reject(new Error(`Streaming request timed out: ${method}`))
        }
      }, 600_000)
    })
  }

  // ── Internal ──────────────────────────────────────────────────────────

  private _write(request: BridgeRequest) {
    if (!this.process?.stdin?.writable) {
      throw new Error('Bridge stdin not writable')
    }
    const line = JSON.stringify(request) + '\n'
    this.process.stdin.write(line)
  }

  private _handleLine(line: string) {
    let msg: BridgeResponse
    try {
      msg = JSON.parse(line) as BridgeResponse
    } catch {
      logger.warn(`Invalid JSON from bridge`, { line: line.slice(0, 200) })
      return
    }

    // Ready message — resolve the startup promise
    if (msg.type === 'ready') {
      if (this._readyResolve) {
        if (this._readyTimeout) clearTimeout(this._readyTimeout)
        this._status = 'ready'
        this._agentDir = (msg.data?.agentDir as string) ?? null
        logger.info(`Bridge ready`, { agentDir: this._agentDir })
        this._readyResolve(this.info)
        this._readyResolve = null
        this._readyTimeout = null
      }
      return
    }

    const id = msg.id
    if (!id) {
      logger.warn(`Bridge message without id`, { type: msg.type })
      return
    }

    const pending = this.pending.get(id)
    if (!pending) {
      logger.warn(`No pending request for id`, { id })
      return
    }

    switch (msg.type) {
      case 'result':
        this.pending.delete(id)
        pending.resolve(msg.data)
        break

      case 'error':
        this.pending.delete(id)
        pending.reject(new Error((msg.data?.message as string) || 'Bridge error'))
        break

      case 'done':
        this.pending.delete(id)
        pending.onEvent?.('done', msg.data)
        pending.resolve(msg.data)
        break

      case 'stream_error':
        this.pending.delete(id)
        pending.onEvent?.('stream_error', msg.data)
        pending.reject(new Error((msg.data?.message as string) || 'Stream error'))
        break

      // Streaming events — forward to callback, don't resolve yet
      case 'token':
      case 'tool_call':
      case 'tool_start':
      case 'tool_complete':
      case 'reasoning':
      case 'stream_start':
        pending.onEvent?.(msg.type, msg.data)
        break

      default:
        logger.warn(`Unknown bridge message type`, { type: (msg as BridgeResponse).type })
    }
  }
}
