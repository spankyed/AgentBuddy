import * as pty from 'node-pty-prebuilt-multiarch'
import { v4 as uuidv4 } from 'uuid'
import type { TerminalInfo, TerminalCreate } from '../types'
import { EARS } from '@/core/types'

interface Terminal {
  info: TerminalInfo
  pty: pty.IPty
  dataHandler?: (data: string) => void
  exitHandler?: (exitCode: number, signal?: number) => void
}

class TerminalService {
  private terminals: Map<string, Terminal> = new Map()
  private readonly MAX_TERMINALS = 10
  private readonly ALLOWED_SHELLS = [
    '/bin/bash',
    '/bin/sh',
    '/bin/zsh',
    '/usr/bin/bash',
    '/usr/bin/sh',
    '/usr/bin/zsh',
    'bash',
    'sh',
    'zsh',
    'powershell.exe',
    'cmd.exe'
  ]
  private readonly BLOCKED_ENV_VARS = [
    'LD_PRELOAD',
    'LD_LIBRARY_PATH',
    'DYLD_INSERT_LIBRARIES',
    'DYLD_LIBRARY_PATH'
  ]

  create(options: TerminalCreate): TerminalInfo {
    // Check terminal limit
    if (this.terminals.size >= this.MAX_TERMINALS) {
      throw new Error(`Maximum number of terminals (${this.MAX_TERMINALS}) reached`)
    }

    // Generate a proper terminal ID that matches EARS.EntityId format
    const id = `Terminal-${uuidv4()}` as EARS.EntityId
    
    // Validate and sanitize shell
    const requestedShell = options.shell || process.env.SHELL || '/bin/bash'
    const shell = this.validateShell(requestedShell)
    
    // Validate cwd exists and is accessible
    const cwd = this.validateCwd(options.cwd || process.cwd())
    
    // Validate terminal dimensions
    const cols = Math.max(1, Math.min(options.cols || 80, 500))
    const rows = Math.max(1, Math.min(options.rows || 24, 200))
    const title = this.sanitizeTitle(options.title || `Terminal ${this.terminals.size + 1}`)

    try {
      // Sanitize environment variables
      const sanitizedEnv = this.sanitizeEnvironment(process.env as { [key: string]: string })
      
      const ptyProcess = pty.spawn(shell, [], {
        name: 'xterm-color',
        cols,
        rows,
        cwd,
        env: sanitizedEnv
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

      const terminal: Terminal = {
        info,
        pty: ptyProcess
      }
      
      this.terminals.set(id, terminal)
      
      return info
    } catch (error) {
      throw new Error(`Failed to create terminal: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
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
    
    return true
  }

  kill(id: string): boolean {
    const terminal = this.terminals.get(id)
    if (!terminal) return false

    try {
      // Clean up handlers
      if (terminal.dataHandler) {
        terminal.dataHandler = undefined
      }
      if (terminal.exitHandler) {
        terminal.exitHandler = undefined
      }
      
      terminal.pty.kill()
      this.terminals.delete(id)
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
      } catch (error) {
        console.error(`Error killing terminal ${id}:`, error)
      }
    }
    this.terminals.clear()
  }

  onData(id: string, callback: (data: string) => void): void {
    const terminal = this.terminals.get(id)
    if (!terminal) return

    // Remove previous handler if exists
    if (terminal.dataHandler) {
      terminal.pty.onData((data) => {}) // Clear by setting empty handler
    }

    terminal.dataHandler = callback
    terminal.pty.onData(callback)
  }

  onExit(id: string, callback: (exitCode: number, signal?: number) => void): void {
    const terminal = this.terminals.get(id)
    if (!terminal) return

    // Wrap the callback to ensure cleanup
    const wrappedCallback = ({ exitCode, signal }: { exitCode: number; signal?: number }) => {
      // Clean up handlers before removing terminal
      if (terminal.dataHandler) {
        terminal.dataHandler = undefined
      }
      if (terminal.exitHandler) {
        terminal.exitHandler = undefined
      }
      this.terminals.delete(id)
      callback(exitCode, signal)
    }

    terminal.exitHandler = callback
    terminal.pty.onExit(wrappedCallback)
  }

  private validateShell(shell: string): string {
    // Normalize shell path
    const normalizedShell = shell.toLowerCase().trim()
    
    // Check against allowed shells
    if (this.ALLOWED_SHELLS.some(allowed => 
      normalizedShell === allowed.toLowerCase() || 
      normalizedShell.endsWith('/' + allowed)
    )) {
      return shell
    }
    
    // Default to bash if invalid shell requested
    console.warn(`Invalid shell requested: ${shell}, defaulting to /bin/bash`)
    return '/bin/bash'
  }

  private validateCwd(cwd: string): string {
    try {
      // Check if directory exists and is accessible
      const fs = require('fs')
      const stats = fs.statSync(cwd)
      if (stats.isDirectory()) {
        return cwd
      }
    } catch (error) {
      console.warn(`Invalid cwd: ${cwd}, defaulting to process.cwd()`)
    }
    return process.cwd()
  }

  private sanitizeTitle(title: string): string {
    // Remove any control characters and limit length
    return title.replace(/[\x00-\x1F\x7F]/g, '').substring(0, 100)
  }

  private sanitizeEnvironment(env: { [key: string]: string }): { [key: string]: string } {
    const sanitized = { ...env }
    
    // Remove dangerous environment variables
    for (const blocked of this.BLOCKED_ENV_VARS) {
      delete sanitized[blocked]
    }
    
    // Add security-related environment variables
    sanitized['NODE_ENV'] = 'production'
    
    return sanitized
  }
}

export const terminalService = new TerminalService()