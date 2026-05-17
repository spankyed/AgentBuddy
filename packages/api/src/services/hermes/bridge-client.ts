/**
 * Hermes Agent Bridge Client — manages the Python subprocess lifecycle.
 *
 * Spawns `hermes-bridge.py` as a child process and communicates via JSONL
 * over stdin/stdout. Provides both request/response and streaming APIs.
 *
 * Detects existing hermes-agent installations (PATH, curl installer, pipx,
 * repo clone) before falling back to a managed venv at ~/.agentbuddy/hermes-venv/.
 */

import { spawn, execSync, exec as execCb, type ChildProcess } from 'child_process'
import { promisify } from 'util'
import { existsSync, mkdirSync } from 'fs'
import { createInterface, type Interface } from 'readline'
import path from 'path'
import os from 'os'
import { createLogger } from '@/core/helpers/debug/logger'
import type { BridgeRequest, BridgeResponse, BridgeStatus, BridgeInfo, HermesConfig, InstallStatus } from './types'

const exec = promisify(execCb)

const logger = createLogger('hermes-bridge')

const BRIDGE_SCRIPT = path.join(process.cwd(), 'src', 'services', 'hermes', 'bridge', 'hermes-bridge.py')
const MANAGED_VENV_DIR = path.join(os.homedir(), '.agentbuddy', 'hermes-venv')
const MANAGED_VENV_PYTHON = path.join(MANAGED_VENV_DIR, 'bin', 'python')
const MANAGED_VENV_PIP = path.join(MANAGED_VENV_DIR, 'bin', 'pip')

// ─── Resolution ─────────────────────────────────────────────────────────────

interface ResolvedPython {
  python: string
  source: string
}

/**
 * Validate that a Python binary can `import run_agent`.
 */
function canImportRunAgent(python: string): boolean {
  try {
    execSync(`"${python}" -c "import run_agent"`, { timeout: 10_000, stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

/**
 * Detect an existing hermes-agent installation.
 *
 * Resolution order:
 * 1. `which hermes-agent` → derive python from the same bin/ dir (pip, pipx, curl installer on PATH)
 * 2. Managed venv: ~/.agentbuddy/hermes-venv/bin/python
 * 3. Curl installer default: ~/.hermes/hermes-agent/venv/bin/python
 * 4. System python: python3 -c "import run_agent"
 * 5. Sibling repo (dev): ../hermes-agent/{.venv,venv}/bin/python
 */
function resolveHermesPython(): ResolvedPython | null {
  // 1. hermes-agent CLI on PATH → derive python from same bin/ directory
  try {
    const binPath = execSync('which hermes-agent', { encoding: 'utf8', timeout: 5000, stdio: 'pipe' }).trim()
    if (binPath) {
      const binDir = path.dirname(binPath)
      const python = path.join(binDir, 'python')
      if (existsSync(python) && canImportRunAgent(python)) {
        return { python, source: 'PATH (hermes-agent)' }
      }
      // Maybe it's a shim — try python3 in same dir
      const python3 = path.join(binDir, 'python3')
      if (existsSync(python3) && canImportRunAgent(python3)) {
        return { python: python3, source: 'PATH (hermes-agent)' }
      }
    }
  } catch { /* not on PATH */ }

  // 2. Managed venv (our own install)
  if (existsSync(MANAGED_VENV_PYTHON) && canImportRunAgent(MANAGED_VENV_PYTHON)) {
    return { python: MANAGED_VENV_PYTHON, source: 'managed venv' }
  }

  // 3. Curl installer default location
  const curlPython = path.join(os.homedir(), '.hermes', 'hermes-agent', 'venv', 'bin', 'python')
  if (existsSync(curlPython) && canImportRunAgent(curlPython)) {
    return { python: curlPython, source: 'curl installer (~/.hermes)' }
  }

  // 4. System python (global pip install)
  for (const name of ['python3', 'python']) {
    try {
      const sysPython = execSync(`which ${name}`, { encoding: 'utf8', timeout: 5000, stdio: 'pipe' }).trim()
      if (sysPython && canImportRunAgent(sysPython)) {
        return { python: sysPython, source: `system (${name})` }
      }
    } catch { continue }
  }

  // 5. Sibling repo (dev) — relative to CWD
  const siblingBase = path.resolve(process.cwd(), '..', 'hermes-agent')
  for (const venvName of ['.venv', 'venv']) {
    const devPython = path.join(siblingBase, venvName, 'bin', 'python')
    if (existsSync(devPython) && canImportRunAgent(devPython)) {
      return { python: devPython, source: `sibling repo (${venvName})` }
    }
  }

  return null
}

// ─── Installation helpers ────────────────────────────────────────────────────

function findSystemPython(): string {
  for (const name of ['python3', 'python']) {
    try {
      const result = execSync(`which ${name}`, { encoding: 'utf8', timeout: 5000, stdio: 'pipe' }).trim()
      if (result) return result
    } catch { continue }
  }
  return 'python3'
}

function getInstalledVersion(python: string): string | null {
  try {
    // Try pip show in the same venv first
    const pipPath = path.join(path.dirname(python), 'pip')
    if (existsSync(pipPath)) {
      const version = execSync(
        `"${pipPath}" show hermes-agent 2>/dev/null | grep -i '^Version:' | cut -d' ' -f2`,
        { encoding: 'utf8', timeout: 10_000 },
      ).trim()
      if (version) return version
    }
    // Fallback: ask python directly
    const version = execSync(
      `"${python}" -c "from importlib.metadata import version; print(version('hermes-agent'))"`,
      { encoding: 'utf8', timeout: 10_000, stdio: 'pipe' },
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
  private _source: string | undefined
  private _error: string | undefined
  private _config: HermesConfig
  private _resolvedPython: ResolvedPython | null = null
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
      source: this._source,
    }
  }

  // ── Installation ────────────────────────────────────────────────────────

  /**
   * Install hermes-agent into the managed venv (fallback when no existing install detected).
   * Calls `onProgress` with status messages for UI feedback.
   */
  async install(onProgress?: (msg: string) => void): Promise<void> {
    if (this._installStatus === 'installing') {
      throw new Error('Installation already in progress')
    }

    // Check if hermes-agent is already available (e.g. on PATH) before reinstalling
    const existing = resolveHermesPython()
    if (existing) {
      this._resolvedPython = existing
      this._installStatus = 'installed'
      this._source = existing.source
      this._version = getInstalledVersion(existing.python)
      logger.info(`hermes-agent already available: ${existing.source} — skipping install`)
      onProgress?.(`hermes-agent already available (${existing.source})`)
      return
    }

    this._installStatus = 'installing'
    this._error = undefined

    try {
      const sysPython = findSystemPython()

      // Ensure parent dir exists
      mkdirSync(path.dirname(MANAGED_VENV_DIR), { recursive: true })

      // Create venv
      onProgress?.('Creating Python environment...')
      await exec(`"${sysPython}" -m venv "${MANAGED_VENV_DIR}"`, { timeout: 60_000 })

      // Upgrade pip
      onProgress?.('Upgrading pip...')
      await exec(`"${MANAGED_VENV_PYTHON}" -m pip install --upgrade pip`, { timeout: 120_000 })

      // Install hermes-agent
      onProgress?.('Installing hermes-agent (this may take a minute)...')
      await exec(`"${MANAGED_VENV_PIP}" install hermes-agent`, { timeout: 300_000 })

      // Re-resolve to pick up the new install
      this._resolvedPython = resolveHermesPython()
      this._installStatus = 'installed'
      this._source = this._resolvedPython?.source
      this._version = getInstalledVersion(MANAGED_VENV_PYTHON)
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
   * Check installation status by resolving an existing hermes-agent Python.
   * Returns 'installed' if found anywhere, 'not_installed' otherwise.
   */
  checkInstall(): InstallStatus {
    this._resolvedPython = resolveHermesPython()
    if (this._resolvedPython) {
      this._installStatus = 'installed'
      this._source = this._resolvedPython.source
      this._version = getInstalledVersion(this._resolvedPython.python)
      logger.info(`hermes-agent resolved: ${this._resolvedPython.source} (${this._resolvedPython.python})`)
    } else {
      this._installStatus = 'not_installed'
      this._source = undefined
      this._version = null
    }
    return this._installStatus
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────

  async start(): Promise<BridgeInfo> {
    if (this.process && this._status === 'ready') {
      return this.info
    }

    // Resolve python if not already done
    if (!this._resolvedPython) {
      this._resolvedPython = resolveHermesPython()
    }

    if (!this._resolvedPython) {
      this._installStatus = 'not_installed'
      throw new Error('hermes-agent is not installed. Install it first.')
    }

    this._installStatus = 'installed'
    this._source = this._resolvedPython.source
    this._status = 'starting'
    this._error = undefined

    const python = this._resolvedPython.python
    logger.info(`Starting Hermes bridge with Python: ${python} (source: ${this._source})`)

    const env: Record<string, string> = { ...process.env } as Record<string, string>
    if (this._config.hermesHome) env.HERMES_HOME = this._config.hermesHome

    this.process = spawn(python, [BRIDGE_SCRIPT], {
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
