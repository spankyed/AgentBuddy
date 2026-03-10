// TODO: [SEARCH_INDEX_FF] Reinstall deps: npm i fastembed@^1.14.1 usearch@^2.15.2 openai@^4.100.0 --workspace @app/api
import { assign, setup } from 'xstate'
import { z } from 'zod'
import { systemBus, fromSystem } from '@/core/helpers/event-helpers'
import type { EARS } from '@/core/types'
import type { LibrarySystemContext, DocumentDTO, CollectionDTO, LibraryItem, FolderContents } from './types'
// [SEARCH_INDEX_FF] import type { SearchIndex } from './search-index/types/search-index'
import { safeEvents } from '@/core/helpers/actor-helpers'
import { bus } from '@/systems/backend'
import { repository } from '@/repository'
import * as path from 'path'
import * as os from 'os'
import { libraryService } from '@/services/library'
import * as symlink from './repository/symlink'
import type { MergeReceivable } from '@/core/helpers/event-helpers'
// [SEARCH_INDEX_FF] import { EMBEDDING_MODELS } from '@/systems/library/search-index/config/embedding-models'
import { toMap, toIdentifierSet, mapArray } from '@/systems/settings/settings-changes'
import { exportLibrary } from './export-library'
import { importLibrary } from './import-library'

export const library = 'library' as const

const busEvent = systemBus(library)

// Content section schemas
const FieldContentSchema = z.object({
  type: z.literal('field'),
  fields: z.array(z.object({
    key: z.string(),
    value: z.string()
  }))
})

const ListContentSchema = z.object({
  type: z.literal('list'),
  items: z.array(z.string())
})

const MarkdownContentSchema = z.object({
  type: z.literal('markdown'),
  text: z.string()
})

const TextContentSchema = z.object({
  type: z.literal('text'),
  text: z.string()
})

const CodeContentSchema = z.object({
  type: z.literal('code'),
  text: z.string(),
  language: z.string()
})

const ContentSectionSchema = z.union([
  FieldContentSchema,
  ListContentSchema,
  MarkdownContentSchema,
  TextContentSchema,
  CodeContentSchema
])

const IncomingLibraryEvents = [
  busEvent('LIST_DOCUMENTS', {
    collectionId: z.string().optional(),
  }),
  busEvent('CREATE_DOCUMENT', {
    name: z.string(),
    content: z.array(ContentSectionSchema),
    tags: z.array(z.string()),
    collectionId: z.string().optional(),
  }),
  busEvent('UPDATE_DOCUMENT', {
    id: z.string(),
    name: z.string(),
    content: z.array(ContentSectionSchema),
    tags: z.array(z.string()),
    collectionId: z.string().optional(),
  }),
  busEvent('DELETE_DOCUMENT', {
    id: z.string(),
  }),
  busEvent('GET_DOCUMENT', {
    id: z.string(),
  }),
  busEvent('LIST_COLLECTIONS'),
  busEvent('CREATE_COLLECTION', {
    name: z.string(),
    description: z.string().optional(),
    parentId: z.string().optional(),
  }),
  busEvent('UPDATE_COLLECTION', {
    id: z.string(),
    name: z.string(),
    description: z.string().optional(),
  }),
  busEvent('DELETE_COLLECTION', {
    id: z.string(),
  }),
  busEvent('MOVE_DOCUMENT', {
    documentId: z.string(),
    collectionId: z.string().optional(),
  }),
  // File browser events
  busEvent('GET_FOLDER_CONTENTS', {
    folderId: z.string().nullable(),
  }),
  busEvent('NAVIGATE_TO_FOLDER', {
    folderId: z.string().nullable(),
  }),
  busEvent('RENAME_ITEM', {
    id: z.string(),
    name: z.string(),
    itemType: z.enum(['document', 'folder']),
  }),
  busEvent('DELETE_ITEMS', {
    ids: z.array(z.string()),
  }),
  busEvent('MOVE_ITEMS', {
    ids: z.array(z.string()),
    targetFolderId: z.string().nullable(),
  }),
  busEvent('REORDER_ITEMS', {
    itemIds: z.array(z.string()),
    targetIndex: z.number(),
    targetFolderId: z.string().nullable(),
  }),
  // [SEARCH_INDEX_FF] Search index events — commented out
  // busEvent('LIST_SEARCH_INDICES', {
  //   folderId: z.string().nullable(),
  // }),
  // busEvent('CREATE_SEARCH_INDEX', {
  //   config: z.object({
  //     name: z.string(),
  //     description: z.string(),
  //     embeddingModel: z.enum([
  //       EMBEDDING_MODELS.MINILM_L6_V2,
  //       EMBEDDING_MODELS.BGE_SMALL_EN,
  //       EMBEDDING_MODELS.BGE_SMALL_EN_V15,
  //       EMBEDDING_MODELS.BGE_BASE_EN,
  //       EMBEDDING_MODELS.BGE_BASE_EN_V15,
  //       EMBEDDING_MODELS.E5_LARGE_MULTILINGUAL,
  //       EMBEDDING_MODELS.OPENAI_SMALL,
  //       EMBEDDING_MODELS.OPENAI_LARGE,
  //     ]),
  //     indexMetric: z.enum(['cosine', 'dot_product']),
  //     connectors: z.number(),
  //     excludeAllSubfolders: z.boolean(),
  //     excludedFolderIds: z.array(z.string()),
  //     excludedDocumentIds: z.array(z.string()),
  //     enableSectionIndexing: z.boolean(),
  //     segmentRules: z.array(z.object({
  //       id: z.string(),
  //       type: z.enum(['text', 'list', 'field']),
  //       occurrence: z.string(),
  //       key: z.string().optional(),
  //       indexMode: z.enum(['combined', 'separate']),
  //     })),
  //     constructTemplate: z.string(),
  //   }),
  //   folderId: z.string().nullable(),
  // }),
  // busEvent('UPDATE_SEARCH_INDEX', {
  //   id: z.string(),
  //   config: z.object({
  //     name: z.string(),
  //     description: z.string(),
  //     embeddingModel: z.enum([
  //       EMBEDDING_MODELS.MINILM_L6_V2,
  //       EMBEDDING_MODELS.BGE_SMALL_EN,
  //       EMBEDDING_MODELS.BGE_SMALL_EN_V15,
  //       EMBEDDING_MODELS.BGE_BASE_EN,
  //       EMBEDDING_MODELS.BGE_BASE_EN_V15,
  //       EMBEDDING_MODELS.E5_LARGE_MULTILINGUAL,
  //       EMBEDDING_MODELS.OPENAI_SMALL,
  //       EMBEDDING_MODELS.OPENAI_LARGE,
  //     ]),
  //     indexMetric: z.enum(['cosine', 'dot_product']),
  //     connectors: z.number(),
  //     excludeAllSubfolders: z.boolean(),
  //     excludedFolderIds: z.array(z.string()),
  //     excludedDocumentIds: z.array(z.string()),
  //     enableSectionIndexing: z.boolean(),
  //     segmentRules: z.array(z.object({
  //       id: z.string(),
  //       type: z.enum(['text', 'list', 'field']),
  //       occurrence: z.string(),
  //       key: z.string().optional(),
  //       indexMode: z.enum(['combined', 'separate']),
  //     })),
  //     constructTemplate: z.string(),
  //   }),
  // }),
  // busEvent('DELETE_SEARCH_INDEX', {
  //   id: z.string(),
  // }),
  // busEvent('SEARCH_IN_INDEX', {
  //   indexId: z.string(),
  //   query: z.string(),
  //   limit: z.number().optional(),
  // }),
  // Symlink events
  busEvent('CREATE_SYMLINK_COLLECTION', {
    name: z.string(),
    symlinkPath: z.string(),
    parentId: z.string().optional(),
  }),
  // Import/Export events
  busEvent('IMPORT_LIBRARY', { items: z.any() }),
  busEvent('EXPORT_LIBRARY', { directory: z.string() }),
] as const

export type OutgoingLibraryEvents =
  | { type: 'LIBRARY_CONNECTED'; data: { documents: DocumentDTO[]; collections: CollectionDTO[]; settings: any } }
  | { type: 'DOCUMENTS_LOADED'; data: { documents: DocumentDTO[] } }
  | { type: 'DOCUMENT_CREATED'; data: { document: DocumentDTO } }
  | { type: 'DOCUMENT_UPDATED'; data: { document: DocumentDTO } }
  | { type: 'DOCUMENT_DELETED'; data: { documentId: string } }
  | { type: 'DOCUMENT_LOADED'; data: { document: DocumentDTO } }
  | { type: 'COLLECTIONS_LOADED'; data: { collections: CollectionDTO[] } }
  | { type: 'COLLECTION_CREATED'; data: { collection: CollectionDTO } }
  | { type: 'COLLECTION_UPDATED'; data: { collection: CollectionDTO } }
  | { type: 'COLLECTION_DELETED'; data: { collectionId: string } }
  | { type: 'LIBRARY_ERROR'; data: { error: string } }
  // File browser events
  | { type: 'FOLDER_CONTENTS_LOADED'; data: FolderContents }
  | { type: 'NAVIGATION_CHANGED'; data: { folderId: string | null; path: string[] } }
  | { type: 'ITEM_RENAMED'; data: { item: LibraryItem } }
  | { type: 'ITEMS_DELETED'; data: { ids: string[] } }
  | { type: 'ITEMS_MOVED'; data: { ids: string[]; targetFolderId: string | null } }
  | { type: 'ITEMS_REORDERED'; data: { itemIds: string[]; targetFolderId: string | null } }
  // [SEARCH_INDEX_FF] Search index events — commented out
  // | { type: 'SEARCH_INDICES_LOADED'; data: { indices: SearchIndex[] } }
  // | { type: 'SEARCH_INDEX_CREATED'; data: { index: SearchIndex } }
  // | { type: 'SEARCH_INDEX_UPDATED'; data: { index: SearchIndex } }
  // | { type: 'SEARCH_INDEX_DELETED'; data: { indexId: string } }
  // | { type: 'SEARCH_RESULTS'; data: { results: any[] } }
  // | { type: 'INDEXING_PROGRESS'; data: { indexId: string; progress: number; total: number } }
  // Import/Export events
  | { type: 'LIBRARY_IMPORTED'; count: number; errors?: string[] }
  | { type: 'LIBRARY_IMPORT_FAILED'; errors: string[] }
  | { type: 'LIBRARY_EXPORTED'; filePath: string; itemCount: number }
  | { type: 'LIBRARY_EXPORT_FAILED'; errors: string[] }

export const LibrarySystemEvents = fromSystem(IncomingLibraryEvents)<OutgoingLibraryEvents, typeof library>()
type LibraryInternalEvents = 
  | { type: 'CLIENT_CONNECTED' }
  | { type: 'LIBRARY_SETTINGS_UPDATED'; settings: any; changes?: any }
type ReceivableEvents = MergeReceivable<typeof IncomingLibraryEvents, LibraryInternalEvents>
const typeOf = safeEvents<ReceivableEvents>()

export const librarySystem = setup({
  types: {
    context: {} as LibrarySystemContext,
    events: {} as ReceivableEvents,
  },
  actions: {
    loadDocuments: async ({ system, event }) => {
      const ev = event as { type: 'LIST_DOCUMENTS'; collectionId?: string }
      const documents = repository.libraryQueries.getDocuments(ev.collectionId)
      system.get(bus).send({
        type: 'OUTGOING' as const,
        event: {
          type: 'DOCUMENTS_LOADED' as const,
          pluginId: 'library',
          data: { documents },
        },
      })
    },
    createDocument: async ({ system, event }) => {
      const ev = event as { type: 'CREATE_DOCUMENT'; name: string; content: any[]; tags: string[]; collectionId?: string }
      const document = await libraryService.create({
        name: ev.name,
        content: ev.content,
        tags: ev.tags,
        parentId: ev.collectionId,
      })
      if (ev.collectionId && symlink.resolveSymlinkPath(ev.collectionId)) {
        const folderContents = await repository.libraryQueries.getFolderContents(ev.collectionId as EARS.EntityId)
        system.get(bus).send({
          type: 'OUTGOING' as const,
          event: { type: 'FOLDER_CONTENTS_LOADED' as const, pluginId: 'library', data: folderContents },
        })
      } else {
        system.get(bus).send({
          type: 'OUTGOING' as const,
          event: { type: 'DOCUMENT_CREATED' as const, pluginId: 'library', data: { document } },
        })
      }
    },
    updateDocument: async ({ system, event }) => {
      const ev = event as { type: 'UPDATE_DOCUMENT'; id: string; name: string; content: any[]; tags: string[]; collectionId?: string }
      const document = await libraryService.update({
        id: ev.id,
        name: ev.name,
        content: ev.content,
        tags: ev.tags,
      })
      system.get(bus).send({
        type: 'OUTGOING' as const,
        event: { type: 'DOCUMENT_UPDATED' as const, pluginId: 'library', data: { document } },
      })
    },
    deleteDocument: async ({ system, event }) => {
      const ev = event as { type: 'DELETE_DOCUMENT'; id: string }
      repository.libraryCommands.deleteDocument(ev.id as EARS.EntityId)
      system.get(bus).send({
        type: 'OUTGOING' as const,
        event: {
          type: 'DOCUMENT_DELETED' as const,
          pluginId: 'library',
          data: { documentId: ev.id },
        },
      })
    },
    getDocument: async ({ system, event }) => {
      const ev = event as { type: 'GET_DOCUMENT'; id: string }
      const document = await libraryService.get(ev.id as EARS.EntityId)
      if (document) {
        system.get(bus).send({
          type: 'OUTGOING' as const,
          event: { type: 'DOCUMENT_LOADED' as const, pluginId: 'library', data: { document } },
        })
      } else {
        system.get(bus).send({
          type: 'OUTGOING' as const,
          event: { type: 'LIBRARY_ERROR' as const, pluginId: 'library', data: { error: 'Document not found' } },
        })
      }
    },
    loadCollections: async ({ system }) => {
      const collections = repository.libraryQueries.getCollections()
      system.get(bus).send({
        type: 'OUTGOING' as const,
        event: {
          type: 'COLLECTIONS_LOADED' as const,
          pluginId: 'library',
          data: { collections },
        },
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
        system.get(bus).send({
          type: 'OUTGOING' as const,
          event: { type: 'FOLDER_CONTENTS_LOADED' as const, pluginId: 'library', data: folderContents },
        })
      } else {
        const collection = repository.libraryCommands.createCollection(
          ev.name,
          ev.description,
          ev.parentId ? ev.parentId as EARS.EntityId : undefined
        )
        system.get(bus).send({
          type: 'OUTGOING' as const,
          event: { type: 'COLLECTION_CREATED' as const, pluginId: 'library', data: { collection } },
        })
      }
    },
    updateCollection: async ({ system, event }) => {
      const ev = event as { type: 'UPDATE_COLLECTION'; id: string; name: string; description?: string }
      const collection = repository.libraryCommands.updateCollection(
        ev.id as EARS.EntityId,
        ev.name,
        ev.description
      )
      system.get(bus).send({
        type: 'OUTGOING' as const,
        event: {
          type: 'COLLECTION_UPDATED' as const,
          pluginId: 'library',
          data: { collection },
        },
      })
    },
    deleteCollection: async ({ system, event }) => {
      const ev = event as { type: 'DELETE_COLLECTION'; id: string }
      repository.libraryCommands.deleteCollection(ev.id as EARS.EntityId)
      system.get(bus).send({
        type: 'OUTGOING' as const,
        event: {
          type: 'COLLECTION_DELETED' as const,
          pluginId: 'library',
          data: { collectionId: ev.id },
        },
      })
    },
    moveDocument: async ({ system, event }) => {
      const ev = event as { type: 'MOVE_DOCUMENT'; documentId: string; collectionId?: string }
      const document = repository.libraryCommands.moveDocument(
        ev.documentId as EARS.EntityId,
        ev.collectionId ? ev.collectionId as EARS.EntityId : undefined
      )
      system.get(bus).send({
        type: 'OUTGOING' as const,
        event: {
          type: 'DOCUMENT_UPDATED' as const,
          pluginId: 'library',
          data: { document },
        },
      })
    },
    sendInitialData: async ({ system }) => {
      // Run migrations
      repository.libraryCommands.migrateDocumentShortCodes()
      repository.libraryCommands.migrateDisplayOrders()
      
      const documents = repository.libraryQueries.getDocuments()
      const collections = repository.libraryQueries.getCollections()
      const librarySettings = repository.settingsQueries.getPluginSettings('library')
      
      system.get(bus).send({
        type: 'OUTGOING' as const,
        event: {
          type: 'LIBRARY_CONNECTED' as const,
          pluginId: 'library',
          data: { 
            documents, 
            collections,
            settings: librarySettings || null
          },
        },
      })
    },
    // File browser actions
    getFolderContents: async ({ system, event }) => {
      const ev = event as { type: 'GET_FOLDER_CONTENTS'; folderId: string | null }
      const folderContents = await repository.libraryQueries.getFolderContents(ev.folderId ? ev.folderId as EARS.EntityId : null)
      system.get(bus).send({
        type: 'OUTGOING' as const,
        event: {
          type: 'FOLDER_CONTENTS_LOADED' as const,
          pluginId: 'library',
          data: folderContents,
        },
      })
    },
    navigateToFolder: async ({ system, event }) => {
      const ev = event as { type: 'NAVIGATE_TO_FOLDER'; folderId: string | null }
      const folderContents = await repository.libraryQueries.getFolderContents(ev.folderId ? ev.folderId as EARS.EntityId : null)
      system.get(bus).send({
        type: 'OUTGOING' as const,
        event: {
          type: 'FOLDER_CONTENTS_LOADED' as const,
          pluginId: 'library',
          data: folderContents,
        },
      })
      system.get(bus).send({
        type: 'OUTGOING' as const,
        event: {
          type: 'NAVIGATION_CHANGED' as const,
          pluginId: 'library',
          data: { folderId: ev.folderId, path: folderContents.currentPath },
        },
      })
    },
    renameItem: async ({ system, event }) => {
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
        system.get(bus).send({
          type: 'OUTGOING' as const,
          event: { type: 'FOLDER_CONTENTS_LOADED' as const, pluginId: 'library', data: folderContents },
        })
      } else {
        const item = repository.libraryCommands.renameItem(ev.id as EARS.EntityId, ev.name, ev.itemType)
        system.get(bus).send({
          type: 'OUTGOING' as const,
          event: { type: 'ITEM_RENAMED' as const, pluginId: 'library', data: { item } },
        })
      }
    },
    deleteItems: async ({ system, event }) => {
      const ev = event as { type: 'DELETE_ITEMS'; ids: string[] }
      await libraryService.remove(ev.ids)
      system.get(bus).send({
        type: 'OUTGOING' as const,
        event: { type: 'ITEMS_DELETED' as const, pluginId: 'library', data: { ids: ev.ids } },
      })
    },
    moveItems: async ({ system, event }) => {
      const ev = event as { type: 'MOVE_ITEMS'; ids: string[]; targetFolderId: string | null }
      await libraryService.move(ev.ids, ev.targetFolderId)
      system.get(bus).send({
        type: 'OUTGOING' as const,
        event: { type: 'ITEMS_MOVED' as const, pluginId: 'library', data: { ids: ev.ids, targetFolderId: ev.targetFolderId } },
      })
    },
    reorderItems: async ({ system, event }) => {
      const ev = event as { type: 'REORDER_ITEMS'; itemIds: string[]; targetIndex: number; targetFolderId: string | null }
      repository.libraryCommands.reorderItems(
        ev.itemIds.map(id => id as EARS.EntityId),
        ev.targetIndex,
        ev.targetFolderId ? ev.targetFolderId as EARS.EntityId : null
      )
      system.get(bus).send({
        type: 'OUTGOING' as const,
        event: {
          type: 'ITEMS_REORDERED' as const,
          pluginId: 'library',
          data: { itemIds: ev.itemIds, targetFolderId: ev.targetFolderId },
        },
      })
    },
    // [SEARCH_INDEX_FF] Search index actions — commented out
    // listSearchIndices: async ({ system, event }) => {
    //   const ev = event as { type: 'LIST_SEARCH_INDICES'; folderId: string | null }
    //   const searchIndexRepo = await import('./search-index/repository')
    //   const indices = await searchIndexRepo.getSearchIndicesForFolder(
    //     ev.folderId ? ev.folderId as EARS.EntityId : null
    //   )
    //   system.get(bus).send({
    //     type: 'OUTGOING' as const,
    //     event: {
    //       type: 'SEARCH_INDICES_LOADED' as const,
    //       pluginId: 'library',
    //       data: { indices },
    //     },
    //   })
    // },
    // createSearchIndex: async ({ system, event }) => {
    //   const ev = event as { type: 'CREATE_SEARCH_INDEX'; config: any; folderId: string | null }
    //   const searchIndexRepo = await import('./search-index/repository')
    //   const index = await searchIndexRepo.createSearchIndex(
    //     ev.config,
    //     ev.folderId ? ev.folderId as EARS.EntityId : null
    //   )
    //   system.get(bus).send({
    //     type: 'OUTGOING' as const,
    //     event: {
    //       type: 'SEARCH_INDEX_CREATED' as const,
    //       pluginId: 'library',
    //       data: { index },
    //     },
    //   })
    // },
    // updateSearchIndex: async ({ system, event }) => {
    //   const ev = event as { type: 'UPDATE_SEARCH_INDEX'; id: string; config: any }
    //   const searchIndexRepo = await import('./search-index/repository')
    //   const index = await searchIndexRepo.updateSearchIndex(
    //     ev.id as EARS.EntityId,
    //     ev.config
    //   )
    //   system.get(bus).send({
    //     type: 'OUTGOING' as const,
    //     event: {
    //       type: 'SEARCH_INDEX_UPDATED' as const,
    //       pluginId: 'library',
    //       data: { index },
    //     },
    //   })
    // },
    // deleteSearchIndex: async ({ system, event }) => {
    //   const ev = event as { type: 'DELETE_SEARCH_INDEX'; id: string }
    //   const searchIndexRepo = await import('./search-index/repository')
    //   await searchIndexRepo.deleteSearchIndex(ev.id as EARS.EntityId)
    //   system.get(bus).send({
    //     type: 'OUTGOING' as const,
    //     event: {
    //       type: 'SEARCH_INDEX_DELETED' as const,
    //       pluginId: 'library',
    //       data: { indexId: ev.id },
    //     },
    //   })
    // },
    // searchInIndex: async ({ system, event }) => {
    //   const ev = event as { type: 'SEARCH_IN_INDEX'; indexId: string; query: string; limit?: number }
    //   const searchIndexRepo = await import('./search-index/repository')
    //   const results = await searchIndexRepo.searchInIndex(
    //     ev.indexId as EARS.EntityId,
    //     ev.query,
    //     ev.limit
    //   )
    //   system.get(bus).send({
    //     type: 'OUTGOING' as const,
    //     event: {
    //       type: 'SEARCH_RESULTS' as const,
    //       pluginId: 'library',
    //       data: { results },
    //     },
    //   })
    // },
    // Symlink actions
    createSymlinkCollection: async ({ system, event }) => {
      const ev = event as { type: 'CREATE_SYMLINK_COLLECTION'; name: string; symlinkPath: string; parentId?: string }
      let resolvedPath = ev.symlinkPath.trim()
      if (resolvedPath.startsWith('~/')) {
        resolvedPath = path.join(os.homedir(), resolvedPath.slice(2))
      } else if (resolvedPath === '~') {
        resolvedPath = os.homedir()
      }
      const collection = repository.libraryCommands.createSymlinkCollection(
        ev.name,
        resolvedPath,
        ev.parentId ? ev.parentId as EARS.EntityId : undefined
      )
      system.get(bus).send({
        type: 'OUTGOING' as const,
        event: {
          type: 'COLLECTION_CREATED' as const,
          pluginId: 'library',
          data: { collection },
        },
      })
    },
    // Import/Export actions
    importLibraryItems: async ({ system, event }) => {
      const ev = event as { type: 'IMPORT_LIBRARY'; items: any }
      const pluginId = library

      if (!Array.isArray(ev.items)) {
        system.get(bus).send({
          type: 'OUTGOING' as const,
          event: {
            type: 'LIBRARY_IMPORT_FAILED' as const,
            pluginId,
            errors: ['Invalid import data: expected an array of items'],
          },
        })
        return
      }

      try {
        const result = importLibrary(ev.items)

        if (result.created === 0 && result.errors.length > 0) {
          system.get(bus).send({
            type: 'OUTGOING' as const,
            event: {
              type: 'LIBRARY_IMPORT_FAILED' as const,
              pluginId,
              errors: result.errors,
            },
          })
          return
        }

        system.get(bus).send({
          type: 'OUTGOING' as const,
          event: {
            type: 'LIBRARY_IMPORTED' as const,
            pluginId,
            count: result.created,
            ...(result.errors.length > 0 ? { errors: result.errors } : {}),
          },
        })

        // Refresh library data
        const documents = repository.libraryQueries.getDocuments()
        const collections = repository.libraryQueries.getCollections()
        const librarySettings = repository.settingsQueries.getPluginSettings('library')

        system.get(bus).send({
          type: 'OUTGOING' as const,
          event: {
            type: 'LIBRARY_CONNECTED' as const,
            pluginId,
            data: {
              documents,
              collections,
              settings: librarySettings || null,
            },
          },
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        system.get(bus).send({
          type: 'OUTGOING' as const,
          event: {
            type: 'LIBRARY_IMPORT_FAILED' as const,
            pluginId,
            errors: [message],
          },
        })
      }
    },
    exportLibraryToFile: async ({ system, event }) => {
      const ev = event as { type: 'EXPORT_LIBRARY'; directory: string }
      const pluginId = library

      try {
        const { filePath, itemCount } = exportLibrary(ev.directory)

        system.get(bus).send({
          type: 'OUTGOING' as const,
          event: {
            type: 'LIBRARY_EXPORTED' as const,
            pluginId,
            filePath,
            itemCount,
          },
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        system.get(bus).send({
          type: 'OUTGOING' as const,
          event: {
            type: 'LIBRARY_EXPORT_FAILED' as const,
            pluginId,
            errors: [message],
          },
        })
      }
    },
    handleSettingsUpdate: ({ system, event }) => {
      const { changes } = typeOf('LIBRARY_SETTINGS_UPDATED', event)
      // Handle nested changes format from detectAllArrayChanges
      const tagChanges = changes?.tags || changes
      
      if (!tagChanges) return
      
      const renames = toMap(tagChanges.renames)
      // Tags use 'name' property as identifier
      const removed = toIdentifierSet(tagChanges.removed, (item: any) => item.name)
      
      if (!renames.size && !removed.size) return
      
      const busSvc = system.get(bus)
      
      // Update all documents that have renamed or removed tags
      for (const doc of repository.libraryQueries.getAllDocuments()) {
        const { next: nextTags, changed } = mapArray(doc.tags, renames, removed)
        
        if (changed) {
          repository.libraryCommands.updateDocumentTags(doc.id, nextTags)
          const updated = repository.libraryQueries.getDocument(doc.id)
          if (updated) {
            busSvc.send({
              type: 'OUTGOING' as const,
              event: {
                type: 'DOCUMENT_UPDATED' as const,
                pluginId: 'library',
                data: { document: updated },
              },
            })
          }
        }
      }
    },
  },
}).createMachine({
  id: library,
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
    LIBRARY_SETTINGS_UPDATED: {
      actions: ['handleSettingsUpdate'],
    },
  },
  states: {
    idle: {
      on: {
        LIST_DOCUMENTS: {
          actions: ['loadDocuments'],
        },
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
        LIST_COLLECTIONS: {
          actions: ['loadCollections'],
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
        REORDER_ITEMS: {
          actions: ['reorderItems'],
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