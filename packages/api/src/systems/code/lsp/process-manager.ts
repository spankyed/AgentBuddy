import { spawn, type ChildProcess } from 'child_process'
import { randomUUID } from 'crypto'
import { createLogger } from '@/core/helpers/debug/logger'
import { StreamMessageReader, type Disposable } from 'vscode-jsonrpc/node.js'
import type { LanguageServerConfig } from './config'

const logger = createLogger('LspService')

const CONTENT_LENGTH_HEADER = 'Content-Length: '
const HEADER_DELIMITER = '\r\n\r\n'

interface LanguageServer {
  config: LanguageServerConfig
  process: ChildProcess
  serverId: string
  status: 'starting' | 'running' | 'stopped' | 'error'
  reader: StreamMessageReader | null
  readerDisposable: Disposable | null
  messageCallback?: (message: string) => void
  errorCallback?: (error: string) => void
  exitCallback?: (code: number | null) => void
}

class LspService {
  private servers: Map<string, LanguageServer> = new Map()
  private readonly MAX_SERVERS = 10

  spawn(config: LanguageServerConfig, rootUri: string): string {
    if (this.servers.size >= this.MAX_SERVERS) {
      throw new Error(`Maximum number of language servers (${this.MAX_SERVERS}) reached`)
    }

    const serverId = randomUUID()
    const command = config.command
    const args = config.args || []

    logger.info(`Spawning language server: ${command} ${args.join(' ')} (id: ${serverId})`)

    let child: ChildProcess
    try {
      child = spawn(command, args, {
        stdio: 'pipe',
        env: {
          ...process.env,
          // Ensure typescript can be found if installed locally
          NODE_PATH: rootUri + '/node_modules',
        },
        cwd: rootUri,
      })
    } catch (err: any) {
      throw new Error(`Failed to spawn language server "${command}": ${err.message}`)
    }

    // Set up StreamMessageReader for stdout (handles Content-Length framing)
    const reader = child.stdout ? new StreamMessageReader(child.stdout) : null

    const server: LanguageServer = {
      config,
      process: child,
      serverId,
      status: 'starting',
      reader,
      readerDisposable: null,
    }

    this.servers.set(serverId, server)

    // Listen for parsed JSON-RPC messages from stdout
    if (reader) {
      server.readerDisposable = reader.listen((message) => {
        server.messageCallback?.(JSON.stringify(message))
      })
      reader.onError((error) => {
        logger.warn(`[${config.id}] reader error: ${error.message}`)
      })
    }

    // Handle stderr — log as warnings
    child.stderr?.on('data', (chunk: Buffer) => {
      const msg = chunk.toString('utf-8').trim()
      if (msg) {
        logger.warn(`[${config.id}] stderr: ${msg}`)
        server.errorCallback?.(msg)
      }
    })

    // Handle process exit
    child.on('exit', (code, signal) => {
      logger.info(`Language server ${config.id} exited (code: ${code}, signal: ${signal})`)
      const srv = this.servers.get(serverId)
      if (srv) {
        srv.status = 'stopped'
        srv.exitCallback?.(code)
      }
    })

    child.on('error', (err) => {
      logger.error(`Language server ${config.id} error: ${err.message}`)
      const srv = this.servers.get(serverId)
      if (srv) {
        srv.status = 'error'
        srv.errorCallback?.(err.message)
        this.servers.delete(serverId)
      }
    })

    // Mark as running once we get the first stdout data or immediately
    server.status = 'running'

    return serverId
  }

  send(serverId: string, message: string): boolean {
    const server = this.servers.get(serverId)
    const stdin = server?.status === 'running' ? server.process.stdin : null

    if (!stdin?.writable) {
      logger.warn(`Cannot send to server ${serverId}: not available`)
      return false
    }

    const contentLength = Buffer.byteLength(message, 'utf-8')
    const header = `${CONTENT_LENGTH_HEADER}${contentLength}${HEADER_DELIMITER}`

    try {
      stdin.write(header + message, 'utf-8')
      return true
    } catch (err: any) {
      logger.error(`Failed to write to server ${serverId}: ${err.message}`)
      return false
    }
  }

  onMessage(serverId: string, callback: (message: string) => void): void {
    const server = this.servers.get(serverId)
    if (server) {
      server.messageCallback = callback
    }
  }

  onError(serverId: string, callback: (error: string) => void): void {
    const server = this.servers.get(serverId)
    if (server) {
      server.errorCallback = callback
    }
  }

  onExit(serverId: string, callback: (code: number | null) => void): void {
    const server = this.servers.get(serverId)
    if (server) {
      server.exitCallback = callback
    }
  }

  kill(serverId: string): boolean {
    const server = this.servers.get(serverId)
    if (!server) return false

    logger.info(`Killing language server ${server.config.id} (${serverId})`)
    server.status = 'stopped'
    server.readerDisposable?.dispose()
    server.reader?.dispose()

    try {
      // Try graceful shutdown first
      server.process.kill('SIGTERM')

      // Force kill after timeout
      setTimeout(() => {
        try {
          if (!server.process.killed) {
            server.process.kill('SIGKILL')
          }
        } catch {
          // Process already dead
        }
      }, 5000)
    } catch {
      // Process already dead
    }

    this.servers.delete(serverId)
    return true
  }

  killAll(): void {
    for (const serverId of this.servers.keys()) {
      this.kill(serverId)
    }
  }

  list(): Array<{ serverId: string; languageId: string; status: string }> {
    return Array.from(this.servers.values()).map(s => ({
      serverId: s.serverId,
      languageId: s.config.id,
      status: s.status,
    }))
  }

  findServerForLanguage(languageId: string): string | null {
    for (const server of this.servers.values()) {
      if (server.config.id === languageId && server.status === 'running') {
        return server.serverId
      }
    }
    return null
  }

}

export const lspService = new LspService()
