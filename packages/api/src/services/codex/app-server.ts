/**
 * Codex App-Server client — manages a persistent `codex app-server` subprocess.
 *
 * Spawns `codex app-server --listen stdio://` and communicates via JSONL.
 * Handles three message types on the wire:
 * 1. Responses to our requests (request correlation via id)
 * 2. Server-initiated requests (approval flow — bidirectional)
 * 3. Notifications (streaming events — routed to per-thread consumers)
 *
 * Template: packages/api/src/services/hermes/bridge-client.ts
 */

import { spawn, type ChildProcess } from 'child_process'
import { createInterface, type Interface } from 'readline'
import { createLogger } from '@/core/helpers/debug/logger'
import type {
  ServerStatus,
  ApprovalDecision,
  ThreadStartParams,
  TurnStartParams,
  ConsumerHandlers,
} from './types'

const logger = createLogger('codex-app-server')

// ─── Request correlation ────────────────────────────────────────────────────

interface PendingRequest {
  resolve: (result: any) => void
  reject: (error: Error) => void
  timeout: ReturnType<typeof setTimeout>
}

// ─── App-Server Client ──────────────────────────────────────────────────────

export class CodexAppServer {
  private process: ChildProcess | null = null
  private readline: Interface | null = null
  private pending = new Map<number, PendingRequest>()
  private consumers = new Map<string, ConsumerHandlers>()
  private _status: ServerStatus = 'stopped'
  private _error: string | undefined
  private _counter = 0
  private _initResolve: ((result: any) => void) | null = null
  private _initReject: ((err: Error) => void) | null = null
  private _initTimeout: ReturnType<typeof setTimeout> | null = null

  get status(): ServerStatus { return this._status }
  get error(): string | undefined { return this._error }

  // ── Lifecycle ───────────────────────────────────────────────────────────

  async start(): Promise<void> {
    if (this.process && this._status === 'ready') return

    this._status = 'starting'
    this._error = undefined

    logger.info('Starting codex app-server')

    this.process = spawn('codex', ['app-server', '--listen', 'stdio://'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    // Forward stderr to logger
    this.process.stderr?.on('data', (chunk: Buffer) => {
      const lines = chunk.toString().split('\n').filter(Boolean)
      for (const line of lines) {
        logger.debug(`[app-server-stderr] ${line}`)
      }
    })

    // Set up readline BEFORE the init promise so we don't miss messages
    this.readline = createInterface({ input: this.process.stdout! })
    this.readline.on('line', (line: string) => this._handleLine(line))

    // Handle process exit
    this.process.on('exit', (code, signal) => {
      logger.info('App-server process exited', { code, signal })
      const wasReady = this._status === 'ready'
      this._status = wasReady ? 'error' : 'stopped'
      if (wasReady) this._error = `Process exited unexpectedly (code=${code})`
      this.process = null
      this.readline = null

      // Reject all pending requests
      for (const [, p] of this.pending) {
        clearTimeout(p.timeout)
        p.reject(new Error(`App-server exited (code=${code})`))
      }
      this.pending.clear()

      // Reject init if pending
      if (this._initReject) {
        this._initReject(new Error(`App-server exited during init (code=${code})`))
        this._initResolve = null
        this._initReject = null
      }
    })

    this.process.on('error', (err) => {
      logger.error('App-server process error', { error: err.message })
      this._status = 'error'
      this._error = err.message
    })

    // Initialize handshake
    await this._initialize()
  }

  async stop(): Promise<void> {
    if (!this.process) return

    logger.info('Stopping codex app-server', { pid: this.process.pid })

    // Close stdin to signal graceful shutdown
    this.process.stdin?.end()

    // Give it 3s to exit, then SIGKILL
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        if (this.process) {
          logger.warn('App-server did not exit gracefully, sending SIGKILL')
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

  async restart(): Promise<void> {
    await this.stop()
    await this.start()
  }

  // ── Thread management ─────────────────────────────────────────────────

  async startThread(params: ThreadStartParams): Promise<{ threadId: string; model: string; cwd: string }> {
    const result = await this._request('thread/start', {
      ...(params.cwd && { cwd: params.cwd }),
      ...(params.model && { model: params.model }),
      ...(params.sandbox && { sandbox: params.sandbox }),
      ...(params.approvalsReviewer && { approvalsReviewer: params.approvalsReviewer }),
    })
    return {
      threadId: result.thread?.id ?? result.thread?.sessionId ?? '',
      model: result.model ?? '',
      cwd: result.cwd ?? '',
    }
  }

  async resumeThread(threadId: string, params?: Partial<ThreadStartParams>): Promise<{ threadId: string }> {
    const result = await this._request('thread/resume', {
      threadId,
      ...(params?.model && { model: params.model }),
    })
    return { threadId: result.thread?.id ?? threadId }
  }

  // ── Turn management ───────────────────────────────────────────────────

  async startTurn(params: TurnStartParams): Promise<{ turnId: string }> {
    const result = await this._request('turn/start', {
      threadId: params.threadId,
      input: params.input,
      ...(params.cwd && { cwd: params.cwd }),
      ...(params.model && { model: params.model }),
      ...(params.collaborationMode && { collaborationMode: params.collaborationMode }),
      ...(params.approvalsReviewer && { approvalsReviewer: params.approvalsReviewer }),
    })
    return { turnId: result.turn?.id ?? '' }
  }

  async interruptTurn(threadId: string, turnId: string): Promise<void> {
    await this._request('turn/interrupt', { threadId, turnId })
  }

  // ── Approval response ─────────────────────────────────────────────────

  respondToApproval(requestId: number, decision: ApprovalDecision): void {
    this._write({ id: requestId, result: { decision } })
  }

  // ── Consumer registration ─────────────────────────────────────────────

  registerConsumer(codexThreadId: string, handlers: ConsumerHandlers): void {
    this.consumers.set(codexThreadId, handlers)
  }

  unregisterConsumer(codexThreadId: string): void {
    this.consumers.delete(codexThreadId)
  }

  // ── Internal ──────────────────────────────────────────────────────────

  private async _initialize(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this._initResolve = () => {
        if (this._initTimeout) clearTimeout(this._initTimeout)
        this._initResolve = null
        this._initReject = null
        this._initTimeout = null
        this._status = 'ready'
        logger.info('App-server ready')
        resolve()
      }
      this._initReject = (err) => {
        if (this._initTimeout) clearTimeout(this._initTimeout)
        this._initResolve = null
        this._initReject = null
        this._initTimeout = null
        reject(err)
      }
      this._initTimeout = setTimeout(() => {
        if (this._initReject) {
          this._initReject(new Error('App-server initialization timed out (15s)'))
        }
        this.stop()
      }, 15_000)

      // Send initialize request
      const id = this._nextId()
      this.pending.set(id, {
        resolve: (result: any) => {
          // Send initialized notification to complete handshake
          this._write({ method: 'initialized', params: {} })
          this._initResolve?.(result)
        },
        reject: (err: Error) => {
          this._initReject?.(err)
        },
        timeout: setTimeout(() => {
          this.pending.delete(id)
          this._initReject?.(new Error('Initialize request timed out'))
        }, 15_000),
      })

      this._write({
        method: 'initialize',
        id,
        params: {
          clientInfo: { name: 'agentbuddy', version: '0.3.0' },
          capabilities: { experimentalApi: true },
        },
      })
    })
  }

  private _nextId(): number {
    return ++this._counter
  }

  private _request(method: string, params: Record<string, any> = {}, timeoutMs = 30_000): Promise<any> {
    if (this._status !== 'ready') {
      return Promise.reject(new Error(`App-server not ready (status: ${this._status})`))
    }

    const id = this._nextId()

    return new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Request timed out: ${method}`))
      }, timeoutMs)

      this.pending.set(id, { resolve, reject, timeout })
      this._write({ method, id, params })
    })
  }

  private _write(msg: Record<string, any>): void {
    if (!this.process?.stdin?.writable) {
      throw new Error('App-server stdin not writable')
    }
    const line = JSON.stringify(msg) + '\n'
    this.process.stdin.write(line)
  }

  private _handleLine(line: string): void {
    let msg: any
    try {
      msg = JSON.parse(line)
    } catch {
      logger.warn('Invalid JSON from app-server', { line: line.slice(0, 200) })
      return
    }

    // Case 1: Response to our request (has id, no method)
    if (msg.id != null && !msg.method) {
      const pending = this.pending.get(msg.id)
      if (!pending) {
        logger.warn('No pending request for id', { id: msg.id })
        return
      }
      this.pending.delete(msg.id)
      clearTimeout(pending.timeout)
      if (msg.error) {
        pending.reject(new Error(msg.error?.message || msg.error?.data || 'App-server error'))
      } else {
        pending.resolve(msg.result)
      }
      return
    }

    // Case 2: Server-initiated request (has id AND method) — approvals
    if (msg.id != null && msg.method) {
      const threadId = msg.params?.threadId
      const consumer = threadId ? this.consumers.get(threadId) : undefined
      if (consumer) {
        consumer.onApproval(msg.method, msg.id, msg.params)
      } else {
        // No consumer registered — auto-decline to unblock the server
        logger.warn('No consumer for approval request, declining', { threadId, method: msg.method })
        this._write({ id: msg.id, result: { decision: 'decline' } })
      }
      return
    }

    // Case 3: Notification (has method, no id) — streaming events
    if (msg.method) {
      const threadId = msg.params?.threadId
      const consumer = threadId ? this.consumers.get(threadId) : undefined
      if (consumer) {
        consumer.onNotification(msg.method, msg.params)
      }
      // Silently drop notifications with no consumer (e.g. thread/closed after cleanup)
      return
    }

    logger.warn('Unrecognized message from app-server', { msg })
  }
}
