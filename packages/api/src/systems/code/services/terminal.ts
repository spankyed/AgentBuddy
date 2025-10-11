import * as pty from 'node-pty'
import { tx } from '@/core/ears/helpers/transaction'
import * as os from 'os'
import * as fs from 'fs'
import type { TerminalInfo, TerminalCreate } from '../types'
import { EARS } from '@/core/types'
import { repository } from '@/repository'

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

    // Generate a proper terminal ID using EARS entity creation
    const id = tx(EARS.Entity.Terminal).id()
    
    // Validate and sanitize shell
    const requestedShell = options.shell || process.env.SHELL || '/bin/bash'
    const shell = this.validateShell(requestedShell)
    
    // Validate cwd exists and is accessible
    const cwd = this.validateCwd(options.cwd)

    // Validate terminal dimensions
    const cols = Math.max(1, Math.min(options.cols || 80, 500))
    const rows = Math.max(1, Math.min(options.rows || 24, 200))

    // Generate default title from cwd (use directory name)
    const defaultTitle = cwd.split('/').filter(Boolean).pop() || 'root'
    const title = this.sanitizeTitle(options.title || defaultTitle)

    try {
      // Sanitize environment variables
      const sanitizedEnv = this.sanitizeEnvironment(process.env as { [key: string]: string })

      // Add shell integration flag
      sanitizedEnv['AGENTBUDDY_SHELL_INTEGRATION'] = '1'

      const ptyProcess = pty.spawn(shell, [], {
        name: 'xterm-color',
        cols,
        rows,
        cwd,
        env: sanitizedEnv
      })

      // Send shell integration setup commands based on shell type
      this.injectShellIntegration(ptyProcess, shell, cwd)

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
      
      // Save terminal metadata to EARS
      repository.terminalCommands.create({
        id,
        title,
        pid: ptyProcess.pid,
        shell,
        cwd,
        active: true,
        cols,
        rows
      })
      
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

    // Update in EARS storage
    repository.terminalCommands.resize(id as EARS.EntityId, cols, rows)

    return true
  }

  rename(id: string, customTitle: string): boolean {
    const terminal = this.terminals.get(id)
    if (!terminal) return false

    const sanitizedTitle = this.sanitizeTitle(customTitle)
    terminal.info.customTitle = sanitizedTitle

    // Update in EARS storage
    repository.terminalCommands.rename(id as EARS.EntityId, sanitizedTitle)

    return true
  }

  updateCwd(id: string, newCwd: string): { cwd: string; title?: string } | null {
    const terminal = this.terminals.get(id)
    if (!terminal) return null

    terminal.info.cwd = newCwd

    // Auto-update title only if no customTitle is set
    let newTitle: string | undefined
    if (!terminal.info.customTitle) {
      newTitle = newCwd.split('/').filter(Boolean).pop() || 'root'
      terminal.info.title = this.sanitizeTitle(newTitle)
    }

    // Update in EARS storage
    repository.terminalCommands.updateCwd(id as EARS.EntityId, newCwd, newTitle)

    return { cwd: newCwd, title: newTitle }
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
      
      // Mark as closed in EARS storage
      repository.terminalCommands.markClosed(id as EARS.EntityId)
      
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

  private validateCwd(cwd?: string): string {
    if (!cwd) {
      // No directory provided, use home directory
      return os.homedir()
    }
    
    try {
      // Check if directory exists and is accessible
      const stats = fs.statSync(cwd)
      if (stats.isDirectory()) {
        return cwd
      }
    } catch (error) {
      console.warn(`Invalid cwd: ${cwd}, defaulting to home directory`, error)
    }
    // Fall back to home directory if provided path is invalid
    return os.homedir()
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

  private injectShellIntegration(ptyProcess: pty.IPty, shell: string, initialCwd: string): void {
    const shellName = shell.split('/').pop()?.toLowerCase() || ''

    if (shellName.includes('bash')) {
      // Bash: Use PROMPT_COMMAND to emit OSC 7 on every prompt
      // Compact single-line version with clear to hide injection output
      const bashIntegration = `[ -z "$AGENTBUDDY_SHELL_INTEGRATION_INJECTED" ] && export AGENTBUDDY_SHELL_INTEGRATION_INJECTED=1 && __agentbuddy_osc7() { printf "\\033]7;file://%s%s\\007" "$(hostname)" "$PWD"; } && PROMPT_COMMAND="__agentbuddy_osc7\${PROMPT_COMMAND:+;\$PROMPT_COMMAND}" && clear`
      ptyProcess.write(bashIntegration + '\n')
    } else if (shellName.includes('zsh')) {
      // Zsh: Use precmd hook to emit OSC 7
      // Compact single-line version with clear to hide injection output
      const zshIntegration = `[[ -z "$AGENTBUDDY_SHELL_INTEGRATION_INJECTED" ]] && export AGENTBUDDY_SHELL_INTEGRATION_INJECTED=1 && __agentbuddy_osc7() { printf "\\033]7;file://%s%s\\007" "$(hostname)" "$PWD"; } && precmd_functions+=(__agentbuddy_osc7) && clear`
      ptyProcess.write(zshIntegration + '\n')
    } else if (shellName.includes('fish')) {
      // Fish: Use function and event
      // Compact version with clear to hide injection output
      const fishIntegration = `test -z "$AGENTBUDDY_SHELL_INTEGRATION_INJECTED"; and set -gx AGENTBUDDY_SHELL_INTEGRATION_INJECTED 1; and function __agentbuddy_osc7 --on-event fish_prompt; printf "\\033]7;file://%s%s\\007" (hostname) $PWD; end; and clear`
      ptyProcess.write(fishIntegration + '\n')
    }
  }

  async restoreAll(setupHandlers: (terminalInfo: TerminalInfo) => void): Promise<void> {
    // Get all active terminals from EARS
    const persistedTerminals = repository.terminalQueries.active()
    
    for (const persistedTerminal of persistedTerminals) {
      try {
        // Skip if already in memory
        if (this.terminals.has(persistedTerminal.id)) {
          continue
        }
        
        // Sanitize environment and add shell integration flag
        const sanitizedEnv = this.sanitizeEnvironment(process.env as { [key: string]: string })
        sanitizedEnv['AGENTBUDDY_SHELL_INTEGRATION'] = '1'

        // Spawn new pty process for the terminal
        const ptyProcess = pty.spawn(persistedTerminal.shell, [], {
          name: 'xterm-color',
          cols: persistedTerminal.cols,
          rows: persistedTerminal.rows,
          cwd: persistedTerminal.cwd,
          env: sanitizedEnv
        })

        // Inject shell integration
        this.injectShellIntegration(ptyProcess, persistedTerminal.shell, persistedTerminal.cwd)
        
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
          pty: ptyProcess
        }
        
        this.terminals.set(persistedTerminal.id, terminal)
        
        // Update PID in EARS since we have a new process
        repository.terminalCommands.updatePid(persistedTerminal.id, ptyProcess.pid)
        
        // Set up handlers for this terminal
        setupHandlers(terminalInfo)
        
        console.log(`Restored terminal: ${persistedTerminal.title} (${persistedTerminal.id})`)
      } catch (error) {
        console.error(`Failed to restore terminal ${persistedTerminal.id}:`, error)
        // Mark as closed if restoration fails
        repository.terminalCommands.markClosed(persistedTerminal.id)
      }
    }
  }
}

export const terminalService = new TerminalService()