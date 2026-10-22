import { write, findById, findAll } from '#generated/ears.ts';

import { EARS } from '#generated/ears.ts'

import { exists } from '@apackdev/sdk/ears';
import { trash } from '@apackdev/sdk/repositories';
import type { TerminalInfo } from '../types.ts'
import { createLogger } from '@apackdev/sdk/logger'

const logger = createLogger('code')

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
}

export const terminalCommands = {
  create: (terminalInfo: Partial<TerminalInfo> & { id: EARS.EntityId }): EARS.EntityId => {
    const now = Date.now()
    
    // The terminal service created the entity when it took its id; this records what it started
    write(terminalInfo.id).setMany({
      title: terminalInfo.title,
      pid: terminalInfo.pid,
      shell: terminalInfo.shell || '/bin/bash',
      cwd: terminalInfo.cwd,
      active: true,
      cols: terminalInfo.cols,
      rows: terminalInfo.rows,
      updatedAt: now
    })
    
    return terminalInfo.id
  },
  
  
  resize: (id: EARS.EntityId, cols: number, rows: number): void => {
    if (!exists(id)) {
      logger.error(`Terminal ${id} not found`)
      return
    }

    write(id).setMany({
      cols,
      rows,
      updatedAt: Date.now()
    })
  },

  rename: (id: EARS.EntityId, customTitle: string): void => {
    if (!exists(id)) {
      logger.error(`Terminal ${id} not found`)
      return
    }

    write(id).setMany({
      customTitle,
      updatedAt: Date.now()
    })
  },

  updateCwd: (id: EARS.EntityId, cwd: string, title?: string): void => {
    if (!exists(id)) {
      logger.error(`Terminal ${id} not found`)
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

    write(id).setMany(updates)
  },
  
  updatePid: (id: EARS.EntityId, pid: number): void => {
    if (!exists(id)) {
      logger.error(`Terminal ${id} not found`)
      return
    }
    
    write(id).setMany({
      pid,
      updatedAt: Date.now()
    })
  },
  
  markClosed: (id: EARS.EntityId): void => {
    if (!exists(id)) {
      logger.error(`Terminal ${id} not found`)
      return
    }
    
    const now = Date.now()
    write(id).setMany({
      active: false,
      closedAt: now,
      updatedAt: now
    })
  },
  
  delete: (id: EARS.EntityId): void => {
    if (!exists(id)) {
      logger.error(`Terminal ${id} not found`)
      return
    }

    // To the trash, inactive, rather than deleted (trash.move stamps updatedAt)
    write(id).set('active', false)
    trash.move([id])
  }
}

