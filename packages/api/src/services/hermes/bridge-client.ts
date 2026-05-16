/**
 * Hermes Agent Bridge Client — manages the Python subprocess lifecycle.
 *
 * Spawns `hermes-bridge.py` as a child process and communicates via JSONL
 * over stdin/stdout. Provides both request/response and streaming APIs.
 *
 * The hermes-agent package is installed into a managed venv at
 * ~/.agentbuddy/hermes-venv/ — no repo clone or manual setup required.
 */

import { spawn, execSync, exec as execCb, type ChildProcess } from 'child_process'
import { promisify } from 'util'
import { mkdirSync } from 'fs'
import { createInterface, type Interface } from 'readline'
import path from 'path'
import os from 'os'
import { createLogger } from '@/core/helpers/debug/logger'
import type { BridgeRequest, BridgeResponse, BridgeStatus, BridgeInfo, HermesConfig, InstallStatus } from './types'

const exec = promisify(execCb)

const logger = createLogger('hermes-bridge')

const BRIDGE_SCRIPT = path.join(process.cwd(), 'src', 'services', 'hermes', 'bridge', 'hermes-bridge.py')
const VENV_DIR = path.join(os.homedir(), '.agentbuddy', 'hermes-venv')
const VENV_PYTHON = path.join(VENV_DIR, 'bin', 'python')
const VENV_PIP = path.join(VENV_DIR, 'bin', 'pip')

// ─── Installation ───────────────────────────────────────────────────────────

function findSystemPython(): string {
  for (const name of ['python3', 'python']) {
    try {
      const result = execSync(`which ${name}`, { encoding: 'utf8', timeout: 5000 }).trim()
      if (result) return result
    } catch { continue }
  }
  return 'python3'
}

function isInstalled(): InstallStatus {
  try {
    execSync(`test -f "${VENV_PYTHON}"`, { timeout: 2000 })
    // Verify hermes-agent is actually importable
    execSync(
      `"${VENV_PYTHON}" -c "import run_agent"`,
      { timeout: 10_000 },
    )
    return 'installed'
  } catch {
    return 'not_installed'
  }
}

function getInstalledVersion(): string | null {
  try {
    const version = execSync(
      `"${VENV_PIP}" show hermes-agent 2>/dev/null | grep -i '^Version:' | cut -d' ' -f2`,
      { encoding: 'utf8', timeout: 10_000 },
    ).trim()
    return version || null
  } catch {
    return null
  }
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
  private _installStatus: InstallStatus = 'unknown'
  private _version: string | null = null
  private _error: string | undefined
  private _config: HermesConfig
  private _readyResolve: ((info: BridgeInfo) => void) | null = null
  private _readyTimeout: ReturnType<typeof setTimeout> | null = null

  constructor(config: HermesConfig = {}) {
    this._config = config
  }

  get status(): BridgeStatus { return this._status }
  get installStatus(): InstallStatus { return this._installStatus }
  get info(): BridgeInfo {
    return {
      status: this._status,
      installStatus: this._installStatus,
      version: this._version,
      pid: this.process?.pid ?? null,
      error: this._error,
    }
  }

  // ── Installation ────────────────────────────────────────────────────────

  /**
   * Install hermes-agent into the managed venv.
   * Calls `onProgress` with status messages for UI feedback.
   */
  async install(onProgress?: (msg: string) => void): Promise<void> {
    if (this._installStatus === 'installing') {
      throw new Error('Installation already in progress')
    }

    this._installStatus = 'installing'
    this._error = undefined

    try {
      const sysPython = findSystemPython()

      // Ensure parent dir exists
      mkdirSync(path.dirname(VENV_DIR), { recursive: true })

      // Create venv
      onProgress?.('Creating Python environment...')
      await exec(`"${sysPython}" -m venv "${VENV_DIR}"`, { timeout: 60_000 })

      // Upgrade pip
      onProgress?.('Upgrading pip...')
      await exec(`"${VENV_PYTHON}" -m pip install --upgrade pip`, { timeout: 120_000 })

      // Install hermes-agent
      onProgress?.('Installing hermes-agent (this may take a minute)...')
      await exec(`"${VENV_PIP}" install hermes-agent`, { timeout: 300_000 })

      this._installStatus = 'installed'
      this._version = getInstalledVersion()
      onProgress?.(`Installed hermes-agent v${this._version}`)
      logger.info(`hermes-agent installed: v${this._version}`)
    } catch (err) {
      this._installStatus = 'error'
      this._error = err instanceof Error ? err.message : String(err)
      logger.error(`hermes-agent install failed: ${this._error}`)
      throw err
    }
  }

  /**
   * Check installation status (refreshes cached value).
   */
  checkInstall(): InstallStatus {
    this._installStatus = isInstalled()
    if (this._installStatus === 'installed') {
      this._version = getInstalledVersion()
    }
    return this._installStatus
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────

  async start(): Promise<BridgeInfo> {
    if (this.process && this._status === 'ready') {
      return this.info
    }

    if (this._installStatus !== 'installed') {
      this._installStatus = isInstalled()
      if (this._installStatus !== 'installed') {
        throw new Error('hermes-agent is not installed. Install it first.')
      }
    }

    this._status = 'starting'
    this._error = undefined

    logger.info(`Starting Hermes bridge with venv Python: ${VENV_PYTHON}`)

    const env: Record<string, string> = { ...process.env } as Record<string, string>
    if (this._config.hermesHome) env.HERMES_HOME = this._config.hermesHome

    this.process = spawn(VENV_PYTHON, [BRIDGE_SCRIPT], {
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
        logger.info(`Bridge ready`)
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
