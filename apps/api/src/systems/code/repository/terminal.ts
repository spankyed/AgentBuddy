import * as pty from 'node-pty-prebuilt-multiarch'
import { v4 as uuidv4 } from 'uuid'
import type { TerminalInfo, TerminalCreate } from '../types'

interface Terminal {
  info: TerminalInfo
  pty: pty.IPty
}

class TerminalService {
  private terminals: Map<string, Terminal> = new Map()

  create(options: TerminalCreate): TerminalInfo {
    const id = options.id || uuidv4()
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
    return true
  }

  kill(id: string): boolean {
    const terminal = this.terminals.get(id)
    if (!terminal) return false

    try {
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
}

export const terminalService = new TerminalService()