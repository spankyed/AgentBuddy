import { registerRepository } from '@/repository'
import { EARS } from '@/core/types'
import { tx } from '@/core/ears/helpers/transaction'
import { qx } from '@/core/ears/helpers/query'
import { createEntityWithDefaults, updateEntity, findById, findAll, exists } from '@/core/shared/repository'
import type { TerminalInfo } from '../types'
import { terminalService } from '../services/terminal'

// Define Terminal entity type with required attributes
export interface TerminalEntity {
  id: EARS.EntityId
  entityType: EARS.Entity.Terminal
  title: string
  customTitle?: string
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
    // findAll already filters soft-deleted, just filter for active=true
    const all = findAll<TerminalEntity>(EARS.Entity.Terminal)
    return all.filter(t => t.active === true)
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
    tx(terminalInfo.id).updateBatch({
      title: terminalInfo.title,
      pid: terminalInfo.pid,
      shell: terminalInfo.shell || '/bin/bash',
      cwd: terminalInfo.cwd,
      active: true,
      cols: terminalInfo.cols,
      rows: terminalInfo.rows,
      createdAt: now,
      updatedAt: now
    })
    
    return terminalInfo.id
  },
  
  
  resize: (id: EARS.EntityId, cols: number, rows: number): void => {
    if (!exists(id)) {
      console.error(`Terminal ${id} not found`)
      return
    }

    tx(id).updateBatch({
      cols,
      rows,
      updatedAt: Date.now()
    })
  },

  rename: (id: EARS.EntityId, customTitle: string): void => {
    if (!exists(id)) {
      console.error(`Terminal ${id} not found`)
      return
    }

    tx(id).updateBatch({
      customTitle,
      updatedAt: Date.now()
    })
  },

  updateCwd: (id: EARS.EntityId, cwd: string, title?: string): void => {
    if (!exists(id)) {
      console.error(`Terminal ${id} not found`)
      return
    }

    const updates: any = {
      cwd,
      updatedAt: Date.now()
    }

    // Update title if provided (when no customTitle is set)
    if (title) {
      updates.title = title
    }

    tx(id).updateBatch(updates)
  },
  
  updatePid: (id: EARS.EntityId, pid: number): void => {
    if (!exists(id)) {
      console.error(`Terminal ${id} not found`)
      return
    }
    
    tx(id).updateBatch({
      pid,
      updatedAt: Date.now()
    })
  },
  
  markClosed: (id: EARS.EntityId): void => {
    if (!exists(id)) {
      console.error(`Terminal ${id} not found`)
      return
    }
    
    const now = Date.now()
    tx(id).updateBatch({
      active: false,
      closedAt: now,
      updatedAt: now
    })
  },
  
  delete: (id: EARS.EntityId): void => {
    if (!exists(id)) {
      console.error(`Terminal ${id} not found`)
      return
    }

    // Mark terminal as deleted instead of actually deleting
    const now = Date.now()
    tx(id).updateBatch({
      active: false,
      deleted: true,
      deletedAt: now,
      updatedAt: now
    })
  }
}

registerRepository('terminalQueries', terminalQueries)
registerRepository('terminalCommands', terminalCommands)