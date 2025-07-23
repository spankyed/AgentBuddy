import * as pty from 'node-pty-prebuilt-multiarch'
import { v4 as uuidv4 } from 'uuid'
import { EARS } from '@/core/types'
import { terminalCommands, terminalQueries } from '../repository'
import type { TerminalInfo, TerminalCreate } from '../types'
import { TerminalOutputProcessor } from './terminal-output-processor'

interface Terminal {
  info: TerminalInfo
  pty: pty.IPty
  processor: TerminalOutputProcessor
}

class TerminalService {
  private terminals: Map<string, Terminal> = new Map()

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

    this.terminals.set(info.id, {
      info,
      pty: ptyProcess,
      processor: new TerminalOutputProcessor()
    })
    
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
      terminal.pty.kill()
      this.terminals.delete(id)
      
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
        terminal.pty.kill()
        // Mark as closed in EARS storage
        terminalCommands.markClosed(id as EARS.EntityId)
      } catch (error) {
        console.error(`Error killing terminal ${id}:`, error)
      }
    }
    this.terminals.clear()
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
      this.terminals.delete(id)
      callback(exitCode, signal)
    })
  }

  getOutput(id: string): string | undefined {
    const terminal = terminalQueries.withOutput(id as EARS.EntityId)
    return terminal?.output
  }

  getProcessedOutput(id: string): string | undefined {
    const terminal = this.terminals.get(id)
    if (!terminal) {
      // Try to get from storage if not in memory
      const stored = terminalQueries.withOutput(id as EARS.EntityId)
      return stored?.output
    }
    return terminal.processor.getStorageSummary()
  }

  processIncomingData(id: string, data: string): void {
    const terminal = this.terminals.get(id)
    if (terminal) {
      terminal.processor.processOutput(data)
    }
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
        
        // Restore processor with existing output
        const processor = persistedTerminal.output 
          ? TerminalOutputProcessor.fromStoredData(persistedTerminal.output)
          : new TerminalOutputProcessor()
        
        this.terminals.set(persistedTerminal.id, {
          info: terminalInfo,
          pty: ptyProcess,
          processor
        })
        
        // Update PID in EARS since we have a new process
        terminalCommands.updatePid(persistedTerminal.id, ptyProcess.pid)
        
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