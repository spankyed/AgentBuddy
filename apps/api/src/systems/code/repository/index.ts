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
  createdAt: number
  updatedAt: number
  closedAt?: number
}

export interface StartupData {
  terminals: TerminalInfo[]
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
  


  getStartupData: (): StartupData => {
    // Get all terminals from the service (only in-memory terminals)
    const terminals = terminalService.list()
    
    return {
      terminals
    }
  }
}

export const terminalCommands = {
  create: (terminalInfo: Partial<TerminalInfo> & { id: EARS.EntityId }): EARS.EntityId => {
    const now = Date.now()
    
    // Create terminal entity with all required attributes using the provided ID
    tx(terminalInfo.id)
      .put('title', terminalInfo.title)
      .put('pid', terminalInfo.pid)
      .put('shell', terminalInfo.shell || '/bin/bash')
      .put('cwd', terminalInfo.cwd)
      .put('active', true)
      .put('cols', terminalInfo.cols)
      .put('rows', terminalInfo.rows)
      .put('createdAt', now)
      .put('updatedAt', now)
    
    return terminalInfo.id
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
  
  updatePid: (id: EARS.EntityId, pid: number): void => {
    if (!exists(id)) {
      console.error(`Terminal ${id} not found`)
      return
    }
    
    tx(id)
      .put('pid', pid)
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