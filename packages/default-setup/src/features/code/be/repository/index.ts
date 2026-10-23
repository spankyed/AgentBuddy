import { write, findById, findAll, query } from '#generated/ears.ts';

import { EARS } from '#generated/ears.ts'

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
    // The terminal service created the entity when it took its id; this records what it started
    write(terminalInfo.id).setMany({
      title: terminalInfo.title,
      pid: terminalInfo.pid,
      shell: terminalInfo.shell || '/bin/bash',
      cwd: terminalInfo.cwd,
      active: true,
      cols: terminalInfo.cols,
      rows: terminalInfo.rows
    })
    
    return terminalInfo.id
  },
  
  
  resize: (id: EARS.EntityId, cols: number, rows: number): void => {
    if (!query.ids(id).exists()) {
      logger.error(`Terminal ${id} not found`)
      return
    }

    write(id).setMany({
      cols,
      rows
    })
  },

  rename: (id: EARS.EntityId, customTitle: string): void => {
    if (!query.ids(id).exists()) {
      logger.error(`Terminal ${id} not found`)
      return
    }

    write(id).setMany({
      customTitle
    })
  },

  updateCwd: (id: EARS.EntityId, cwd: string, title?: string): void => {
    if (!query.ids(id).exists()) {
      logger.error(`Terminal ${id} not found`)
      return
    }

    const updates: any = {
      cwd
    }

    // Update title if provided (when no customTitle is set)
    if (title) {
      updates.title = title
    }

    write(id).setMany(updates)
  },
  
  updatePid: (id: EARS.EntityId, pid: number): void => {
    if (!query.ids(id).exists()) {
      logger.error(`Terminal ${id} not found`)
      return
    }
    
    write(id).setMany({
      pid
    })
  },
  
  markClosed: (id: EARS.EntityId): void => {
    if (!query.ids(id).exists()) {
      logger.error(`Terminal ${id} not found`)
      return
    }
    
    const now = Date.now()
    write(id).setMany({
      active: false,
      closedAt: now
    })
  },
  
  delete: (id: EARS.EntityId): void => {
    if (!query.ids(id).exists()) {
      logger.error(`Terminal ${id} not found`)
      return
    }

    // To the trash, inactive, rather than deleted
    write(id).set('active', false).trash()
  }
}

