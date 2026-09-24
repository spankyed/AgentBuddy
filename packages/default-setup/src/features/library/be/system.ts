// [SEARCH_INDEX_FF] The search index is dormant: ./search-index/README.md lists its call sites and how to turn it on
import type { Contract } from './contract';
import { services } from '@/__generated__/services';
import { setup } from 'xstate'
import { defineSystem, type SystemEntry } from '@abuddy/sdk/framework'
import type { EARS } from '@/__generated__/ears'
import type { LibrarySystemContext, DocumentDTO, CollectionDTO, LibraryIndex, LibraryItem, FolderContents } from './types'
// [SEARCH_INDEX_FF] import type { SearchIndex } from './search-index/types/search-index'
import { sendToSystem, broadcastToPlugin } from '@/__generated__/events'
import { repository } from '@/__generated__/repository';
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs/promises'
import { libraryService } from './services/library'
import * as symlink from './repository/symlink'
// [SEARCH_INDEX_FF] import { DEFAULT_EMBEDDING_MODEL } from '@/features/library/embedding-models'
import { toMap, toIdentifierSet, mapArray } from '@abuddy/sdk/utils'
import { exportLibrary } from './export-library'
import { importLibrary } from './import-library'
import type { ContentSection } from '@/features/library/be/types';
import type { CommandItem } from '@/__generated__/types';
import { ref } from '@/__generated__/ref';
import { errorMessage } from '@abuddy/sdk/utils/pure';

export const librarySpec = defineSystem<Contract>();

function resolveHomePath(inputPath: string): string {
  const trimmed = inputPath.trim()
  if (trimmed.startsWith('~/')) return path.join(os.homedir(), trimmed.slice(2))
  if (trimmed === '~') return os.homedir()
  return trimmed
}

/**
 * Tells the threads system the chat's slash commands changed, when a library change altered them: a document in the
 * commands folder, or the folder, was created, edited, moved, renamed, deleted or imported. `before` is the list from
 * before the change.
 */
function notifyIfCommandsChanged(before: CommandItem[]): void {
  if (JSON.stringify(libraryService.commands()) === JSON.stringify(before)) return
  sendToSystem('threads', { type: 'COMMANDS_CHANGED' })
}

export const librarySystem = setup({
  types: librarySpec.types,
  actions: {
    createDocument: async ({ system, event }) => {
      const commandsBefore = libraryService.commands()
      const ev = event as { type: 'CREATE_DOCUMENT'; name: string; content: any[]; tags: string[]; collectionId?: string }
      const document = await libraryService.create({
        name: ev.name,
        content: ev.content,
        tags: ev.tags,
        parentId: ev.collectionId,
      })
      if (ev.collectionId && symlink.resolveSymlinkPath(ev.collectionId)) {
        const folderContents = await repository.libraryQueries.getFolderContents(ev.collectionId as EARS.EntityId)
        broadcastToPlugin('library', { type: 'FOLDER_CONTENTS_LOADED' as const, data: folderContents })
      } else {
        broadcastToPlugin('library', { type: 'DOCUMENT_CREATED' as const, data: { document } })
      }

      notifyIfCommandsChanged(commandsBefore)
    },
    updateDocument: async ({ system, event }) => {
      const commandsBefore = libraryService.commands()
      const ev = event as { type: 'UPDATE_DOCUMENT'; id: string; name: string; content: any[]; tags: string[]; collectionId?: string }
      const document = await libraryService.update({
        id: ev.id,
        name: ev.name,
        content: ev.content,
        tags: ev.tags,
      })
      broadcastToPlugin('library', { type: 'DOCUMENT_UPDATED' as const, data: { document } })

      notifyIfCommandsChanged(commandsBefore)
    },
    deleteDocument: async ({ system, event }) => {
      const commandsBefore = libraryService.commands()
      const ev = event as { type: 'DELETE_DOCUMENT'; id: string }
      repository.libraryCommands.deleteDocument(ev.id as EARS.EntityId)
      broadcastToPlugin('library', {
          type: 'DOCUMENT_DELETED' as const,
          data: { documentId: ev.id },
        })
      notifyIfCommandsChanged(commandsBefore)
    },
    getDocument: async ({ system, event }) => {
      const ev = event as { type: 'GET_DOCUMENT'; id: string }
      const document = await libraryService.get(ev.id as EARS.EntityId)
      if (document) {
        broadcastToPlugin('library', { type: 'DOCUMENT_LOADED' as const, data: { document } })
      } else {
        broadcastToPlugin('library', { type: 'LIBRARY_ERROR' as const, data: { error: 'Document not found' } })
      }
    },
    sendIndex: ({ system }) => {
      broadcastToPlugin('library', {
          type: 'LIBRARY_INDEX_LOADED' as const,
          data: { index: repository.libraryQueries.getIndex() },
        })
    },
    createCollection: async ({ system, event }) => {
      const ev = event as { type: 'CREATE_COLLECTION'; name: string; description?: string; parentId?: string }
      const isSymlink = ev.parentId ? !!symlink.resolveSymlinkPath(ev.parentId) : false
      if (isSymlink) {
        await libraryService.createFolder({
          name: ev.name,
          parentId: ev.parentId,
        })
        const folderContents = await repository.libraryQueries.getFolderContents(ev.parentId as EARS.EntityId)
        broadcastToPlugin('library', { type: 'FOLDER_CONTENTS_LOADED' as const, data: folderContents })
      } else {
        const collection = repository.libraryCommands.createCollection(
          ev.name,
          ev.description,
          ev.parentId ? ev.parentId as EARS.EntityId : undefined
        )
        broadcastToPlugin('library', { type: 'COLLECTION_CREATED' as const, data: { collection } })
      }
    },
    updateCollection: async ({ system, event }) => {
      const commandsBefore = libraryService.commands()
      const ev = event as { type: 'UPDATE_COLLECTION'; id: string; name: string; description?: string }
      const collection = repository.libraryCommands.updateCollection(
        ev.id as EARS.EntityId,
        ev.name,
        ev.description
      )
      broadcastToPlugin('library', {
          type: 'COLLECTION_UPDATED' as const,
          data: { collection },
        })
      notifyIfCommandsChanged(commandsBefore)
    },
    deleteCollection: async ({ system, event }) => {
      const commandsBefore = libraryService.commands()
      const ev = event as { type: 'DELETE_COLLECTION'; id: string }
      repository.libraryCommands.deleteCollection(ev.id as EARS.EntityId)
      broadcastToPlugin('library', {
          type: 'COLLECTION_DELETED' as const,
          data: { collectionId: ev.id },
        })
      notifyIfCommandsChanged(commandsBefore)
    },
    moveDocument: async ({ system, event }) => {
      const commandsBefore = libraryService.commands()
      const ev = event as { type: 'MOVE_DOCUMENT'; documentId: string; collectionId?: string }
      const document = repository.libraryCommands.moveDocument(
        ev.documentId as EARS.EntityId,
        ev.collectionId ? ev.collectionId as EARS.EntityId : undefined
      )
      broadcastToPlugin('library', {
          type: 'DOCUMENT_UPDATED' as const,
          data: { document },
        })
      notifyIfCommandsChanged(commandsBefore)
    },
    sendInitialData: async ({ system }) => {
      // Run migrations
      repository.libraryCommands.migrateDocumentShortCodes()
      repository.libraryCommands.migrateDisplayOrders()

      const librarySettings = services.settings.forFeature(ref('library'))

      broadcastToPlugin('library', {
          type: 'LIBRARY_CONNECTED' as const,
          data: {
            index: repository.libraryQueries.getIndex(),
            settings: librarySettings || null
          },
        })
    },
    // File browser actions
    getFolderContents: async ({ system, event }) => {
      const ev = event as { type: 'GET_FOLDER_CONTENTS'; folderId: string | null }
      const folderContents = await repository.libraryQueries.getFolderContents(ev.folderId ? ev.folderId as EARS.EntityId : null)
      broadcastToPlugin('library', {
          type: 'FOLDER_CONTENTS_LOADED' as const,
          data: folderContents,
        })
    },
    navigateToFolder: async ({ system, event }) => {
      const ev = event as { type: 'NAVIGATE_TO_FOLDER'; folderId: string | null }
      const folderContents = await repository.libraryQueries.getFolderContents(ev.folderId ? ev.folderId as EARS.EntityId : null)
      broadcastToPlugin('library', {
          type: 'FOLDER_CONTENTS_LOADED' as const,
          data: folderContents,
        })
      broadcastToPlugin('library', {
          type: 'NAVIGATION_CHANGED' as const,
          data: { folderId: ev.folderId, path: folderContents.currentPath },
        })
    },
    renameItem: async ({ system, event }) => {
      const commandsBefore = libraryService.commands()
      const ev = event as { type: 'RENAME_ITEM'; id: string; name: string; itemType: 'document' | 'folder' }
      if (symlink.isSymlinkId(ev.id)) {
        await libraryService.rename(ev.id, ev.name)
        // Compute parent folder ID and refresh its contents
        const parsed = symlink.parseSymlinkId(ev.id)
        let parentFolderId: string | null = null
        if (parsed) {
          const resolved = symlink.resolveSymlinkPath(ev.id)
          const basePath = symlink.getSymlinkCollectionPath(parsed.collectionId)
          if (resolved && basePath) {
            const parentRelPath = path.dirname(path.relative(basePath, resolved.absolutePath))
            parentFolderId = parentRelPath && parentRelPath !== '.'
              ? symlink.buildSymlinkId(parsed.collectionId, parentRelPath)
              : parsed.collectionId
          } else {
            parentFolderId = parsed.collectionId
          }
        }
        const folderContents = await repository.libraryQueries.getFolderContents(
          parentFolderId ? parentFolderId as EARS.EntityId : null
        )
        broadcastToPlugin('library', { type: 'FOLDER_CONTENTS_LOADED' as const, data: folderContents })
      } else {
        const item = repository.libraryCommands.renameItem(ev.id as EARS.EntityId, ev.name, ev.itemType)
        broadcastToPlugin('library', { type: 'ITEM_RENAMED' as const, data: { item } })
      }
      notifyIfCommandsChanged(commandsBefore)
    },
    deleteItems: async ({ system, event }) => {
      const commandsBefore = libraryService.commands()
      const ev = event as { type: 'DELETE_ITEMS'; ids: string[] }
      await libraryService.remove(ev.ids)
      broadcastToPlugin('library', { type: 'ITEMS_DELETED' as const, data: { ids: ev.ids } })
      notifyIfCommandsChanged(commandsBefore)
    },
    moveItems: async ({ system, event }) => {
      const commandsBefore = libraryService.commands()
      const ev = event as { type: 'MOVE_ITEMS'; ids: string[]; targetFolderId: string | null }
      await libraryService.move(ev.ids, ev.targetFolderId)
      broadcastToPlugin('library', { type: 'ITEMS_MOVED' as const, data: { ids: ev.ids, targetFolderId: ev.targetFolderId } })
      notifyIfCommandsChanged(commandsBefore)
    },
    // [SEARCH_INDEX_FF] Search index actions — commented out
    // listSearchIndices: async ({ system, event }) => {
    //   const ev = event as { type: 'LIST_SEARCH_INDICES'; folderId: string | null }
    //   const searchIndexRepo = await import('./search-index/repository')
    //   const indices = await searchIndexRepo.getSearchIndicesForFolder(
    //     ev.folderId ? ev.folderId as EARS.EntityId : null
    //   )
    //   broadcastToPlugin('library', { type: 'SEARCH_INDICES_LOADED', data: { indices } })
    // },
    // createSearchIndex: async ({ system, event }) => {
    //   const ev = event as { type: 'CREATE_SEARCH_INDEX'; config: any; folderId: string | null }
    //   const searchIndexRepo = await import('./search-index/repository')
    //   const index = await searchIndexRepo.createSearchIndex(
    //     ev.config,
    //     ev.folderId ? ev.folderId as EARS.EntityId : null
    //   )
    //   broadcastToPlugin('library', { type: 'SEARCH_INDEX_CREATED', data: { index } })
    // },
    // updateSearchIndex: async ({ system, event }) => {
    //   const ev = event as { type: 'UPDATE_SEARCH_INDEX'; id: string; config: any }
    //   const searchIndexRepo = await import('./search-index/repository')
    //   const index = await searchIndexRepo.updateSearchIndex(
    //     ev.id as EARS.EntityId,
    //     ev.config
    //   )
    //   broadcastToPlugin('library', { type: 'SEARCH_INDEX_UPDATED', data: { index } })
    // },
    // deleteSearchIndex: async ({ system, event }) => {
    //   const ev = event as { type: 'DELETE_SEARCH_INDEX'; id: string }
    //   const searchIndexRepo = await import('./search-index/repository')
    //   await searchIndexRepo.deleteSearchIndex(ev.id as EARS.EntityId)
    //   broadcastToPlugin('library', { type: 'SEARCH_INDEX_DELETED', data: { indexId: ev.id } })
    // },
    // searchInIndex: async ({ system, event }) => {
    //   const ev = event as { type: 'SEARCH_IN_INDEX'; indexId: string; query: string; limit?: number }
    //   const searchIndexRepo = await import('./search-index/repository')
    //   const results = await searchIndexRepo.searchInIndex(
    //     ev.indexId as EARS.EntityId,
    //     ev.query,
    //     ev.limit
    //   )
    //   broadcastToPlugin('library', { type: 'SEARCH_RESULTS', data: { results } })
    // },
    // Symlink actions
    createSymlinkCollection: async ({ system, event }) => {
      const ev = event as { type: 'CREATE_SYMLINK_COLLECTION'; name: string; symlinkPath: string; parentId?: string }
      const resolvedPath = resolveHomePath(ev.symlinkPath)
      const collection = repository.libraryCommands.createSymlinkCollection(
        ev.name,
        resolvedPath,
        ev.parentId ? ev.parentId as EARS.EntityId : undefined
      )
      broadcastToPlugin('library', {
          type: 'COLLECTION_CREATED' as const,
          data: { collection },
        })

    },
    updateSymlinkPath: async ({ system, event }) => {
      const ev = event as { type: 'UPDATE_SYMLINK_PATH'; collectionId: string; newPath: string }
      const resolvedPath = resolveHomePath(ev.newPath)

      // Validate the new path exists and is a directory
      try {
        const stat = await fs.stat(resolvedPath)
        if (!stat.isDirectory()) throw new Error('Not a directory')
      } catch {
        broadcastToPlugin('library', {
            type: 'LIBRARY_ERROR' as const,
            data: { error: `Path does not exist: ${resolvedPath}` },
          })
        return
      }

      const collection = repository.libraryCommands.updateSymlinkPath(
        ev.collectionId as EARS.EntityId,
        resolvedPath
      )

      broadcastToPlugin('library', {
          type: 'SYMLINK_UPDATED' as const,
          data: { collection },
        })
    },
    // Import/Export actions
    importLibraryItems: async ({ system, event }) => {
      const commandsBefore = libraryService.commands()
      const ev = event as { type: 'IMPORT_LIBRARY'; directory: string }

      try {
        const result = importLibrary(ev.directory)

        if (result.created === 0 && result.errors.length > 0) {
          broadcastToPlugin('library', {
              type: 'LIBRARY_IMPORT_FAILED' as const,
              errors: result.errors,
            })
          return
        }

        broadcastToPlugin('library', {
            type: 'LIBRARY_IMPORTED' as const,
            count: result.created,
            ...(result.errors.length > 0 ? { errors: result.errors } : {}),
          })

        // Refresh library data
        const librarySettings = services.settings.forFeature(ref('library'))

        broadcastToPlugin('library', {
            type: 'LIBRARY_CONNECTED' as const,
            data: {
              index: repository.libraryQueries.getIndex(),
              settings: librarySettings || null,
            },
          })
      } catch (err) {
        const message = errorMessage(err)
        broadcastToPlugin('library', {
            type: 'LIBRARY_IMPORT_FAILED' as const,
            errors: [message],
          })
      }
      // An import can fail part way, after creating documents
      notifyIfCommandsChanged(commandsBefore)
    },
    exportLibraryToFile: async ({ system, event }) => {
      const ev = event as { type: 'EXPORT_LIBRARY'; directory: string; format: 'markdown' | 'json' }

      try {
        const { filePath, itemCount } = exportLibrary(ev.directory, ev.format)

        broadcastToPlugin('library', {
            type: 'LIBRARY_EXPORTED' as const,
            filePath,
            itemCount,
          })
      } catch (err) {
        const message = errorMessage(err)
        broadcastToPlugin('library', {
            type: 'LIBRARY_EXPORT_FAILED' as const,
            errors: [message],
          })
      }
    },
    handleSettingsUpdate: ({ system, event }) => {
      const { changes } = librarySpec.typeOf('FEATURE_SETTINGS_UPDATED', event)
      const tagChanges = changes?.tags
      
      if (!tagChanges) return
      
      const renames = toMap(tagChanges.renames)
      // Tags use 'name' property as identifier
      const removed = toIdentifierSet(tagChanges.removed, (item: any) => item.name)
      
      if (!renames.size && !removed.size) return
      
      
      // Update all documents that have renamed or removed tags
      for (const doc of repository.libraryQueries.getAllDocuments()) {
        const { next: nextTags, changed } = mapArray(doc.tags, renames, removed)
        
        if (changed) {
          repository.libraryCommands.updateDocumentTags(doc.id, nextTags)
          const updated = repository.libraryQueries.getDocument(doc.id)
          if (updated) {
            broadcastToPlugin('library', {
                type: 'DOCUMENT_UPDATED' as const,
                data: { document: updated },
              })
          }
        }
      }
    },
  },
}).createMachine({
  id: 'library',
  initial: 'idle',
  context: ({ input }) => ({
    documents: [],
    collections: [],
    currentItems: [],
    currentFolderId: null,
    currentPath: [],
  }),
  on: {
    CLIENT_CONNECTED: {
      actions: ['sendInitialData'],
    },
    // A pack's seeds can add or change the library's documents
    PACK_CHANGED: {
      actions: ['sendInitialData'],
    },
    FEATURE_SETTINGS_UPDATED: {
      actions: ['handleSettingsUpdate'],
    },
  },
  states: {
    idle: {
      on: {
        CREATE_DOCUMENT: {
          actions: ['createDocument'],
        },
        UPDATE_DOCUMENT: {
          actions: ['updateDocument'],
        },
        DELETE_DOCUMENT: {
          actions: ['deleteDocument'],
        },
        GET_DOCUMENT: {
          actions: ['getDocument'],
        },
        GET_LIBRARY_INDEX: {
          actions: ['sendIndex'],
        },
        CREATE_COLLECTION: {
          actions: ['createCollection'],
        },
        UPDATE_COLLECTION: {
          actions: ['updateCollection'],
        },
        DELETE_COLLECTION: {
          actions: ['deleteCollection'],
        },
        MOVE_DOCUMENT: {
          actions: ['moveDocument'],
        },
        // File browser events
        GET_FOLDER_CONTENTS: {
          actions: ['getFolderContents'],
        },
        NAVIGATE_TO_FOLDER: {
          actions: ['navigateToFolder'],
        },
        RENAME_ITEM: {
          actions: ['renameItem'],
        },
        DELETE_ITEMS: {
          actions: ['deleteItems'],
        },
        MOVE_ITEMS: {
          actions: ['moveItems'],
        },
        // [SEARCH_INDEX_FF] Search index events — commented out
        // LIST_SEARCH_INDICES: { actions: ['listSearchIndices'] },
        // CREATE_SEARCH_INDEX: { actions: ['createSearchIndex'] },
        // UPDATE_SEARCH_INDEX: { actions: ['updateSearchIndex'] },
        // DELETE_SEARCH_INDEX: { actions: ['deleteSearchIndex'] },
        // SEARCH_IN_INDEX: { actions: ['searchInIndex'] },
        // Symlink events
        CREATE_SYMLINK_COLLECTION: {
          actions: ['createSymlinkCollection'],
        },
        UPDATE_SYMLINK_PATH: {
          actions: ['updateSymlinkPath'],
        },
        // Import/Export events
        IMPORT_LIBRARY: {
          actions: ['importLibraryItems'],
        },
        EXPORT_LIBRARY: {
          actions: ['exportLibraryToFile'],
        },
      },
    },
  },
})

const libraryEntry = { spec: librarySpec, machine: librarySystem };

export default libraryEntry;