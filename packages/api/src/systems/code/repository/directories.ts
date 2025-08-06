import { EARS } from '@/core/types'
import { tx } from '@/core/utils/ears/helpers/transaction'
import { qx } from '@/core/utils/ears/helpers/query'
import { randomId } from '@/core/utils/random-id'

// Define Directory entity type with required attributes
export interface DirectoryEntity {
  id: EARS.EntityId
  entityType: EARS.Entity.Directory
  path: string
  label?: string  // User-friendly name
  lastAccessedAt: number
  createdAt: number
  role?: 'lastOpened' | 'recent'
}

const DIRECTORY_ROLE = {
  LAST_OPENED: EARS.RoleKind.Custom('lastOpened'),
  RECENT: EARS.RoleKind.Custom('recent'),
} as const

export const directoryQueries = {
  /**
   * Get the last opened directory
   */
  getLastOpenedDirectory: (): DirectoryEntity | undefined => {
    const results = qx(EARS.Entity.Directory)
      .where('role', DIRECTORY_ROLE.LAST_OPENED)
      .pickAll() as unknown as DirectoryEntity[]
    
    return results[0]
  },

  /**
   * Get recent directories (excluding last opened)
   */
  getRecentDirectories: (limit = 10): DirectoryEntity[] => {
    const results = qx(EARS.Entity.Directory)
      .where('role', DIRECTORY_ROLE.RECENT)
      .pickAll() as unknown as DirectoryEntity[]
    
    // Sort by lastAccessedAt descending and limit
    return results
      .sort((a, b) => b.lastAccessedAt - a.lastAccessedAt)
      .slice(0, limit)
  },

  /**
   * Check if a directory path exists in the store
   */
  findByPath: (path: string): DirectoryEntity | undefined => {
    const results = qx(EARS.Entity.Directory)
      .where('path', path)
      .pickAll() as unknown as DirectoryEntity[]
    
    return results[0]
  }
}

export const directoryCommands = {
  /**
   * Save a directory to the store
   */
  saveDirectory: (path: string, label?: string): EARS.EntityId => {
    const now = Date.now()
    
    // Check if directory already exists
    const existing = directoryQueries.findByPath(path)
    
    if (existing) {
      // Update existing directory
      tx(existing.id).updateBatch({
        lastAccessedAt: now,
        label: label || existing.label
      })
      
      return existing.id
    }
    
    // Create new directory entity
    const id = `Directory-${randomId()}` as EARS.EntityId
    
    tx(id)
      .put('path', path)
      .put('label', label)
      .put('lastAccessedAt', now)
      .put('createdAt', now)
      .put('role', DIRECTORY_ROLE.RECENT)
    
    return id
  },

  /**
   * Mark a directory as the last opened one
   */
  markAsLastOpened: (path: string): void => {
    // First, remove lastOpened role from any existing directory
    const currentLastOpened = directoryQueries.getLastOpenedDirectory()
    if (currentLastOpened) {
      tx(currentLastOpened.id).update('role', DIRECTORY_ROLE.RECENT)
    }
    
    // Save/update the directory and mark it as last opened
    const id = directoryCommands.saveDirectory(path)
    tx(id).updateBatch({
      role: DIRECTORY_ROLE.LAST_OPENED,
      lastAccessedAt: Date.now()
    })
  },

  /**
   * Clear all directory data (useful for testing)
   */
  clearAll: (): void => {
    const allDirectories = qx(EARS.Entity.Directory).pickAll() as unknown as DirectoryEntity[]
    allDirectories.forEach(dir => {
      // Properly destroy the entity instead of nulling attributes
      tx(dir.id).destroy()
    })
  }
}