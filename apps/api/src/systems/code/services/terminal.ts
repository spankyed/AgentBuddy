import * as pty from 'node-pty-prebuilt-multiarch'
import { v4 as uuidv4 } from 'uuid'
import { EARS } from '@/core/types'
import { terminalCommands, terminalQueries } from '../repository'
import type { TerminalInfo, TerminalCreate } from '../types'
import { Transform } from 'node:stream'
import { stripVTControlCharacters as strip } from 'node:util'
const handleBackspaces = require('handle-backspaces') as (str: string) => string

interface Terminal {
  info: TerminalInfo
  pty: pty.IPty
  flushTimer?: NodeJS.Timeout
  buffer: string
}

class TerminalService {
  private terminals: Map<string, Terminal> = new Map()
  private seenLines: Map<string, Set<string>> = new Map() // Per-terminal LRU cache

  private createCleaningPipeline(terminalId: string, ptyProcess: pty.IPty, terminal: Terminal) {
    // Initialize LRU cache for this terminal
    const seen = new Set<string>()
    this.seenLines.set(terminalId, seen)
    const MAX_SEEN = 50

    // A. Handle backspaces first to preserve terminal semantics
    const backspaceHandler = new Transform({
      transform(chunk, _e, cb) {
        const text = chunk.toString('utf8')
        const cleaned = handleBackspaces(text)
        this.push(cleaned)
        cb()
      }
    })

    // B. Remove ANSI escape codes
    const ansiFree = new Transform({
      transform(chunk, _e, cb) {
        this.push(strip(chunk.toString('utf8')))
        cb()
      }
    })

    // C. Dedupe \r redraws and repeated identical lines
    interface DedupeTransform extends Transform {
      _buf?: string
    }
    
    const dedupe = new Transform({
      readableObjectMode: true,
      transform(this: DedupeTransform, chunk: any, _enc: BufferEncoding, cb: Function) {
        const text = chunk.toString('utf8')
        
        // Handle \r manually: split on \n OR \r, keep last complete piece
        this._buf = (this._buf || '') + text
        const parts = this._buf.split(/[\r\n]/)
        this._buf = parts.pop()! // save trailing partial line

        for (const line of parts) {
          const trimmedLine = line.trim()
          if (!trimmedLine) continue // skip empty lines
          
          // Check LRU cache
          if (seen.has(trimmedLine)) continue // skip if we've seen this recently
          
          // Add to LRU cache
          seen.add(trimmedLine)
          if (seen.size > MAX_SEEN) {
            // Remove oldest entry
            const firstValue = seen.values().next().value
            if (firstValue !== undefined) {
              seen.delete(firstValue)
            }
          }
          
          this.push(line) // emit the line (preserving original formatting)
        }
        cb()
      },
      flush(this: DedupeTransform, cb: Function) {
        if (this._buf && this._buf.trim()) {
          const trimmedLine = this._buf.trim()
          if (!seen.has(trimmedLine)) {
            this.push(this._buf)
          }
        }
        cb()
      }
    } as any)

    // Connect the pipes: PTY → Backspace → ANSI → Dedupe
    ptyProcess.onData(data => backspaceHandler.write(data))
    backspaceHandler.pipe(ansiFree)
    ansiFree.pipe(dedupe)

    // Batched writes to EARS
    dedupe.on('data', (cleanLine: string) => {
      this.appendBuffered(terminalId, terminal, cleanLine + '\n')
    })

    return dedupe
  }

  private appendBuffered(terminalId: string, terminal: Terminal, data: string) {
    terminal.buffer += data
    
    // Clear existing timer
    if (terminal.flushTimer) {
      clearTimeout(terminal.flushTimer)
    }
    
    // Set new timer for batched write
    terminal.flushTimer = setTimeout(() => {
      if (terminal.buffer) {
        terminalCommands.appendOutput(terminalId as EARS.EntityId, terminal.buffer)
        terminal.buffer = ''
      }
      terminal.flushTimer = undefined
    }, 100) // Flush every 100ms
  }

  private flushTerminalBuffer(terminalId: string) {
    const terminal = this.terminals.get(terminalId)
    if (!terminal) return
    
    // Clear timer
    if (terminal.flushTimer) {
      clearTimeout(terminal.flushTimer)
      terminal.flushTimer = undefined
    }
    
    // Flush any remaining buffer
    if (terminal.buffer) {
      terminalCommands.appendOutput(terminalId as EARS.EntityId, terminal.buffer)
      terminal.buffer = ''
    }
  }

  async create(options: TerminalCreate): Promise<TerminalInfo> {
    // Generate EARS EntityId
    const shell = options.shell || process.env.SHELL || 'bash'
    const cwd = options.cwd || process.cwd()
    const cols = options.cols || 80
    const rows = options.rows || 24
    const title = options.title || `Terminal ${this.terminals.size + 1}`

    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-color',
      cols,
      rows,
      cwd,
      env: process.env as { [key: string]: string }
    })

    const info: TerminalInfo = {
      title,
      pid: ptyProcess.pid,
      shell,
      cwd,
      active: true,
      cols,
      rows
    } as TerminalInfo

    // Save terminal to EARS storage
    info.id = terminalCommands.create(info)

    const terminal: Terminal = {
      info,
      pty: ptyProcess,
      buffer: ''
    }
    
    this.terminals.set(info.id, terminal)
    
    // Set up the cleaning pipeline for this terminal
    this.createCleaningPipeline(info.id, ptyProcess, terminal)
    
    // Mark that handlers will be set up by the caller
    // (we don't set them up here since the create method doesn't have access to the bus)

    return info
  }

  get(id: string): Terminal | undefined {
    return this.terminals.get(id)
  }

  list(): TerminalInfo[] {
    return Array.from(this.terminals.values()).map(t => t.info)
  }

  write(id: string, data: string): boolean {
    const terminal = this.terminals.get(id)
    if (!terminal) return false

    terminal.pty.write(data)
    return true
  }

  resize(id: string, cols: number, rows: number): boolean {
    const terminal = this.terminals.get(id)
    if (!terminal) return false

    terminal.pty.resize(cols, rows)
    terminal.info.cols = cols
    terminal.info.rows = rows
    
    // Update in EARS storage
    terminalCommands.resize(id as EARS.EntityId, cols, rows)
    
    return true
  }

  kill(id: string): boolean {
    const terminal = this.terminals.get(id)
    if (!terminal) return false

    try {
      // Flush any pending output
      this.flushTerminalBuffer(id)
      
      terminal.pty.kill()
      this.terminals.delete(id)
      this.seenLines.delete(id) // Clean up LRU cache
      
      // Mark as closed in EARS storage
      terminalCommands.markClosed(id as EARS.EntityId)
      
      return true
    } catch (error) {
      console.error('Error killing terminal:', error)
      return false
    }
  }

  killAll(): void {
    for (const [id, terminal] of this.terminals) {
      try {
        // Flush any pending output
        this.flushTerminalBuffer(id)
        
        terminal.pty.kill()
        // Mark as closed in EARS storage
        terminalCommands.markClosed(id as EARS.EntityId)
      } catch (error) {
        console.error(`Error killing terminal ${id}:`, error)
      }
    }
    this.terminals.clear()
    this.seenLines.clear() // Clean up all LRU caches
  }

  onData(id: string, callback: (data: string) => void): void {
    const terminal = this.terminals.get(id)
    if (!terminal) return

    terminal.pty.onData(callback)
  }

  onExit(id: string, callback: (exitCode: number, signal?: number) => void): void {
    const terminal = this.terminals.get(id)
    if (!terminal) return

    terminal.pty.onExit(({ exitCode, signal }) => {
      // Flush any pending output before removing
      this.flushTerminalBuffer(id)
      this.terminals.delete(id)
      this.seenLines.delete(id) // Clean up LRU cache
      callback(exitCode, signal)
    })
  }

  getOutput(id: string): string | undefined {
    const terminal = terminalQueries.withOutput(id as EARS.EntityId)
    return terminal?.output
  }

  getAllActiveTerminals(): TerminalInfo[] {
    return this.list()
  }

  async restoreAll(setupHandlers: (terminalInfo: TerminalInfo) => void): Promise<void> {
    // Get all active terminals from EARS
    const persistedTerminals = terminalQueries.active()
    
    for (const persistedTerminal of persistedTerminals) {
      try {
        // Skip if already in memory
        if (this.terminals.has(persistedTerminal.id)) {
          continue
        }
        
        // Spawn new pty process for the terminal
        const ptyProcess = pty.spawn(persistedTerminal.shell, [], {
          name: 'xterm-color',
          cols: persistedTerminal.cols,
          rows: persistedTerminal.rows,
          cwd: persistedTerminal.cwd,
          env: process.env as { [key: string]: string }
        })
        
        const terminalInfo: TerminalInfo = {
          id: persistedTerminal.id,
          title: persistedTerminal.title,
          pid: ptyProcess.pid,
          shell: persistedTerminal.shell,
          cwd: persistedTerminal.cwd,
          active: persistedTerminal.active,
          cols: persistedTerminal.cols,
          rows: persistedTerminal.rows
        }
        
        const terminal: Terminal = {
          info: terminalInfo,
          pty: ptyProcess,
          buffer: ''
        }
        
        this.terminals.set(persistedTerminal.id, terminal)
        
        // Update PID in EARS since we have a new process
        terminalCommands.updatePid(persistedTerminal.id, ptyProcess.pid)
        
        // Set up the cleaning pipeline for restored terminal
        this.createCleaningPipeline(persistedTerminal.id, ptyProcess, terminal)
        
        // Set up handlers for this terminal
        setupHandlers(terminalInfo)
        
        console.log(`Restored terminal: ${persistedTerminal.title} (${persistedTerminal.id})`)
      } catch (error) {
        console.error(`Failed to restore terminal ${persistedTerminal.id}:`, error)
        // Mark as closed if restoration fails
        terminalCommands.markClosed(persistedTerminal.id)
      }
    }
  }
}

export const terminalService = new TerminalService()