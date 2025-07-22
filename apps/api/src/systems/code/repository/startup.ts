import { terminalService } from './terminal'
import { terminalQueries } from './terminal-storage'
import type { TerminalInfo } from '../types'

export interface StartupData {
  terminals: TerminalInfo[]
  terminalOutputs: Record<string, string>
}

export const getStartupData = (): StartupData => {
  // Get all active terminals
  const terminals = terminalService.getAllActiveTerminals()
  
  // Get output for each terminal
  const terminalOutputs: Record<string, string> = {}
  
  terminals.forEach(terminal => {
    const output = terminalService.getOutput(terminal.id)
    if (output) {
      terminalOutputs[terminal.id] = output
    }
  })
  
  return {
    terminals,
    terminalOutputs
  }
}