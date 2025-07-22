import * as pty from 'node-pty-prebuilt-multiarch'
import { v4 as uuidv4 } from 'uuid'
import { EARS } from '@/core/types'
import { terminalCommands, terminalQueries } from './terminal-storage'
import type { TerminalInfo, TerminalCreate } from '../types'

interface Terminal {
  info: TerminalInfo
  pty: pty.IPty
}

class TerminalService {
  private terminals: Map<string, Terminal> = new Map()

  async create(options: TerminalCreate): Promise<TerminalInfo> {
    // Generate EARS EntityId
    const id = options.id || `${EARS.Entity.Terminal}-${uuidv4()}` as EARS.EntityId
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
      id,
      title,
      pid: ptyProcess.pid,
      shell,
      cwd,
      active: true,
      cols,
      rows
    }

    this.terminals.set(id, {
      info,
      pty: ptyProcess
    })

    // Save terminal to EARS storage
    terminalCommands.create(info)

    return info
  }

  get(id: string): Terminal | undefined {
    return this.terminals.get(id)
  }

  list(): TerminalInfo[] {
    // Get active terminals from memory
    const memoryTerminals = Array.from(this.terminals.values()).map(t => t.info)
    
    // Get persisted terminals from EARS
    const persistedTerminals = terminalQueries.active()
    
    // Merge and deduplicate based on ID
    const terminalMap = new Map<string, TerminalInfo>()
    
    // Add memory terminals first (they have the most up-to-date info)
    memoryTerminals.forEach(t => terminalMap.set(t.id, t))
    
    // Add persisted terminals that aren't in memory
    persistedTerminals.forEach(t => {
      if (!terminalMap.has(t.id)) {
        terminalMap.set(t.id, {
          id: t.id,
          title: t.title,
          pid: t.pid,
          shell: t.shell,
          cwd: t.cwd,
          active: t.active,
          cols: t.cols,
          rows: t.rows
        })
      }
    })
    
    return Array.from(terminalMap.values())
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

  getAllActiveTerminals(): TerminalInfo[] {
    return terminalQueries.active().map(t => ({
      id: t.id,
      title: t.title,
      pid: t.pid,
      shell: t.shell,
      cwd: t.cwd,
      active: t.active,
      cols: t.cols,
      rows: t.rows
    }))
  }
}

export const terminalService = new TerminalService()