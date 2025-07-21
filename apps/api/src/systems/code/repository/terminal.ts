import { spawn, ChildProcessWithoutNullStreams } from 'child_process'
import { v4 as uuidv4 } from 'uuid'
import type { TerminalInfo, TerminalCreate } from '../types'

interface Terminal {
  info: TerminalInfo
  process: ChildProcessWithoutNullStreams
  onDataCallback?: (data: string) => void
  onExitCallback?: (exitCode: number, signal?: number) => void
}

class TerminalService {
  private terminals: Map<string, Terminal> = new Map()

  create(options: TerminalCreate): TerminalInfo {
    const id = options.id || uuidv4()
    const shell = options.shell || process.env.SHELL || '/bin/bash'
    const cwd = options.cwd || process.cwd()
    const cols = options.cols || 80
    const rows = options.rows || 24
    const title = options.title || `Terminal ${this.terminals.size + 1}`

    // Use spawn with stdio configuration for interactive terminal
    const shellProcess = spawn(shell, [], {
      cwd,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLUMNS: cols.toString(),
        LINES: rows.toString()
      },
      shell: true,
      // Use 'pipe' for stdin/stdout/stderr to allow interaction
      stdio: ['pipe', 'pipe', 'pipe']
    })

    const info: TerminalInfo = {
      id,
      title,
      pid: shellProcess.pid || 0,
      shell,
      cwd,
      active: true,
      cols,
      rows
    }

    const terminal: Terminal = {
      info,
      process: shellProcess
    }

    // Set up stdout/stderr handlers
    shellProcess.stdout.on('data', (data: Buffer) => {
      const output = data.toString('utf8')
      if (terminal.onDataCallback) {
        terminal.onDataCallback(output)
      }
    })

    shellProcess.stderr.on('data', (data: Buffer) => {
      const output = data.toString('utf8')
      if (terminal.onDataCallback) {
        terminal.onDataCallback(output)
      }
    })

    // Set up exit handler
    shellProcess.on('exit', (code, signal) => {
      this.terminals.delete(id)
      if (terminal.onExitCallback) {
        terminal.onExitCallback(code || 0, signal ? signal as unknown as number : undefined)
      }
    })

    shellProcess.on('error', (err) => {
      console.error('Terminal process error:', err)
      this.terminals.delete(id)
      if (terminal.onExitCallback) {
        terminal.onExitCallback(1)
      }
    })

    this.terminals.set(id, terminal)

    // Send initial prompt
    setTimeout(() => {
      if (terminal.onDataCallback) {
        // Send a newline to trigger the shell prompt
        shellProcess.stdin.write('\n')
      }
    }, 100)

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
    if (!terminal || !terminal.process.stdin) return false

    try {
      terminal.process.stdin.write(data)
      return true
    } catch (error) {
      console.error('Error writing to terminal:', error)
      return false
    }
  }

  resize(id: string, cols: number, rows: number): boolean {
    const terminal = this.terminals.get(id)
    if (!terminal) return false

    // Update the environment variables (note: this won't affect the running process)
    // For proper resize support, we'd need node-pty or similar
    terminal.info.cols = cols
    terminal.info.rows = rows
    
    // Send resize escape sequence
    try {
      terminal.process.stdin.write(`\x1b[8;${rows};${cols}t`)
      return true
    } catch (error) {
      console.error('Error resizing terminal:', error)
      return false
    }
  }

  kill(id: string): boolean {
    const terminal = this.terminals.get(id)
    if (!terminal) return false

    try {
      terminal.process.kill('SIGTERM')
      this.terminals.delete(id)
      return true
    } catch (error) {
      console.error('Error killing terminal:', error)
      try {
        terminal.process.kill('SIGKILL')
        this.terminals.delete(id)
        return true
      } catch (killError) {
        console.error('Error force killing terminal:', killError)
        return false
      }
    }
  }

  killAll(): void {
    for (const [id, terminal] of this.terminals) {
      try {
        terminal.process.kill('SIGTERM')
      } catch (error) {
        console.error(`Error killing terminal ${id}:`, error)
        try {
          terminal.process.kill('SIGKILL')
        } catch (killError) {
          console.error(`Error force killing terminal ${id}:`, killError)
        }
      }
    }
    this.terminals.clear()
  }

  onData(id: string, callback: (data: string) => void): void {
    const terminal = this.terminals.get(id)
    if (!terminal) return

    terminal.onDataCallback = callback
  }

  onExit(id: string, callback: (exitCode: number, signal?: number) => void): void {
    const terminal = this.terminals.get(id)
    if (!terminal) return

    terminal.onExitCallback = callback
  }
}

export const terminalService = new TerminalService()