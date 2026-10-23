import { create, write, findById, query } from '#generated/ears.ts';

import { EARS } from '#generated/ears.ts'

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
    return query(EARS.Entity.Terminal).pickAll()
  },

  active: (): TerminalEntity[] => {
    // A query already leaves out the trash; keep the active ones
    const all = query(EARS.Entity.Terminal).pickAll()
    return all.filter(t => t.active === true)
  },
}

export const terminalCommands = {
  /** Records a terminal the service started, under the id it took for it (`newId`) */
  create: (terminal: Pick<TerminalEntity, 'title' | 'pid' | 'shell' | 'cwd' | 'cols' | 'rows'> & { id: EARS.EntityId<'Terminal'> }): EARS.EntityId => {
    return create(EARS.Entity.Terminal, { ...terminal, active: true }).id()
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

