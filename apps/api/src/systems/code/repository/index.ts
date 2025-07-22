import { EARS } from '@/core/types'
import { tx, qx } from '@/services/database'
import { createEntityWithDefaults, updateEntity, findById, findAll, exists } from '@/core/utils/repository'
import type { TerminalInfo } from '../types'
import { terminalService } from '../services/terminal'

// Define Terminal entity type with required attributes
export interface TerminalEntity {
  id: EARS.EntityId
  entityType: EARS.Entity.Terminal
  title: string
  pid: number
  shell: string
  cwd: string
  active: boolean
  cols: number
  rows: number
  output: string
  createdAt: number
  updatedAt: number
  closedAt?: number
}

export interface StartupData {
  terminals: TerminalInfo[]
  terminalOutputs: Record<string, string>
}

export const terminalQueries = {
  byId: (id: EARS.EntityId): TerminalEntity | undefined => {
    return findById<TerminalEntity>(id)
  },
  
  all: (): TerminalEntity[] => {
    return findAll<TerminalEntity>(EARS.Entity.Terminal)
  },
  
  active: (): TerminalEntity[] => {
    return qx(EARS.Entity.Terminal)
      .where('active', true)
      .pickAll() as unknown as TerminalEntity[]
  },
  
  withOutput: (id: EARS.EntityId): Pick<TerminalEntity, 'output' | 'title' | 'cwd'> | undefined => {
    const result = qx(id).pickOne(['output', 'title', 'cwd'])
    if (!result) return undefined
    return result as Pick<TerminalEntity, 'output' | 'title' | 'cwd'>
  },


  getStartupData: (): StartupData => {
    // ! Get all active terminals (bad practice to call service directly in queries, but for simplicity)
    const terminals = terminalService.getAllActiveTerminals()
    
    // ! Get output for each terminal
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
}

export const terminalCommands = {
  create: (terminalInfo: TerminalInfo & { output?: string }): EARS.EntityId => {
    const now = Date.now()
    
    // Create terminal entity with all required attributes
    const id = tx(EARS.Entity.Terminal)
      .put('id', terminalInfo.id) // Use provided EARS ID
      .put('title', terminalInfo.title)
      .put('pid', terminalInfo.pid)
      .put('shell', terminalInfo.shell || '/bin/bash')
      .put('cwd', terminalInfo.cwd)
      .put('active', true)
      .put('cols', terminalInfo.cols)
      .put('rows', terminalInfo.rows)
      .put('output', terminalInfo.output || '')
      .put('createdAt', now)
      .put('updatedAt', now)
      .id()
    
    return id
  },
  
  updateOutput: (id: EARS.EntityId, output: string): void => {
    if (!exists(id)) {
      console.error(`Terminal ${id} not found`)
      return
    }
    
    tx(id)
      .put('output', output)
      .put('updatedAt', Date.now())
  },
  
  appendOutput: (id: EARS.EntityId, newOutput: string): void => {
    const terminal = terminalQueries.byId(id)
    if (!terminal) {
      console.error(`Terminal ${id} not found`)
      return
    }
    
    // Append new output to existing output
    const updatedOutput = terminal.output + newOutput
    
    tx(id)
      .put('output', updatedOutput)
      .put('updatedAt', Date.now())
  },
  
  resize: (id: EARS.EntityId, cols: number, rows: number): void => {
    if (!exists(id)) {
      console.error(`Terminal ${id} not found`)
      return
    }
    
    tx(id)
      .put('cols', cols)
      .put('rows', rows)
      .put('updatedAt', Date.now())
  },
  
  markClosed: (id: EARS.EntityId): void => {
    if (!exists(id)) {
      console.error(`Terminal ${id} not found`)
      return
    }
    
    const now = Date.now()
    tx(id)
      .put('active', false)
      .put('closedAt', now)
      .put('updatedAt', now)
  },
  
  delete: (id: EARS.EntityId): void => {
    if (!exists(id)) {
      console.error(`Terminal ${id} not found`)
      return
    }
    
    // Mark terminal as deleted instead of actually deleting
    const now = Date.now()
    tx(id)
      .put('active', false)
      .put('deleted', true)
      .put('deletedAt', now)
      .put('updatedAt', now)
  }
}