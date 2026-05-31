import { setup, assign, type ActorRefFrom } from 'xstate'
import type { DocumentDTO, CollectionDTO, OutgoingLibraryEvents, LibraryItem, DocumentItem, FolderContents, BreadcrumbItem, ContentSection, SearchIndex } from '@app/api'
import type { SearchIndexFormData } from './types/search-index'
import { trpc } from '@/core/trpc'
import { Trash2 } from 'lucide-vue-next'
import { contextMenuFn } from '@/core/context-menu'
import breadcrumb, { breadcrumbWithParams } from '@/core/breadcrumb'
import {
  targetIs,
  TRAIL_CLICK,
  type TrailClickEvent,
} from '@/core/actors/route-trailer'
import { tagStorage } from './services/tagStorage'
import { type NavHistory, createNavHistory, pushNavHistory, goBack, goForward, canGoBack, canGoForward } from '@/core/utils/nav-history'

// Helper function to convert DocumentItem to DocumentDTO
function documentItemToDTO(item: DocumentItem): DocumentDTO {
  return {
    id: item.id,
    name: item.name,
    content: item.content,
    shortCode: item.shortCode,
    tags: item.tags || [],
    collectionId: item.parentId || undefined,
    collectionPath: [], // Not available in DocumentItem
    displayOrder: item.displayOrder,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  }
}

function parseSymlinkId(id: string): { rootId: string; relPath: string } | null {
  if (!id.startsWith('symlink:')) return null
  const rest = id.slice('symlink:'.length)
  const slashIdx = rest.indexOf('/')
  return slashIdx === -1
    ? { rootId: rest, relPath: '' }
    : { rootId: rest.slice(0, slashIdx), relPath: rest.slice(slashIdx + 1) }
}

function findItemById(context: LibraryContext, id: string): LibraryItem | undefined {
  const top = context.items.find(i => i.id === id)
  if (top) return top
  for (const children of Object.values(context.expandedFolderChildren)) {
    const found = children.find(i => i.id === id)
    if (found) return found
  }
  return undefined
}

export const id = 'library' as const
import type { SnapshotFrom } from 'xstate'

export type LibraryState = SnapshotFrom<typeof librarySystem>

export interface LibraryContext {
  // Core view state
  currentView: 'browser' | 'create' | 'edit' | 'create-index' | 'edit-index' | 'test-index'
  editingDocument?: DocumentDTO

  // File browser fields
  items: LibraryItem[]
  currentFolderId: string | null
  currentPath: string[]
  selectedItems: string[]
  selectedDocument: DocumentDTO | null
  sortBy: 'name' | 'modified' | 'size' | 'kind'
  sortDirection: 'asc' | 'desc'
  breadcrumbs: BreadcrumbItem[]
  editingItem?: LibraryItem
  itemToEdit?: string | null
  newItemId?: string | null

  // Tree view fields
  expandedFolderIds: string[]
  expandedFolderChildren: Record<string, LibraryItem[]>
  loadingFolderIds: string[]

  // Legacy fields (used by CreateView/EditView for compatibility)
  documents: DocumentDTO[]
  collections: CollectionDTO[]
  selectedCollectionId?: string

  // Search index fields
  searchIndices: SearchIndex[]
  editingIndexId?: string
  editingIndex?: SearchIndex

  // Search test fields
  testingIndexId?: string
  testingIndex?: SearchIndex
  testQuery: string
  testResults: any[]
  isSearching: boolean

  // Symlink context
  isInSymlinkContext: boolean
  currentSymlinkRootId: string | null
  symlinkBasePath: string | null
  isBroken: boolean
  lastKnownPath: string | null

  // Settings
  settings?: any

  // Import/Export
  libraryImport: { status: 'idle' | 'importing' | 'success' | 'error'; errors: string[]; importedCount: number }
  libraryExport: { status: 'idle' | 'exporting' | 'success' | 'error'; errors: string[]; filePath: string; itemCount: number }

  navHistory: NavHistory<string | null>
}

export type LibraryEvents =
  | { type: 'PLUGIN_ACTIVATED' }
  | { type: 'TRAIL_CLICK'; trail: string[] }
  | { type: 'VIEW_BROWSER' }

  // Legacy document events
  | { type: 'CREATE_DOCUMENT' }
  | { type: 'EDIT_DOCUMENT'; documentId: string }
  | { type: 'DELETE_DOCUMENT'; documentId: string }
  | { type: 'SAVE_DOCUMENT'; name: string; content: ContentSection[]; tags: string[]; collectionId?: string }
  | { type: 'CANCEL_EDIT' }

  // Search Index events
  | { type: 'CREATE_SEARCH_INDEX' }
  | { type: 'SAVE_SEARCH_INDEX'; config: SearchIndexFormData }
  | { type: 'CANCEL_CREATE_INDEX' }
  | { type: 'LIST_SEARCH_INDICES' }
  | { type: 'EDIT_SEARCH_INDEX'; indexId: string }
  | { type: 'UPDATE_SEARCH_INDEX'; indexId: string; config: SearchIndexFormData }
  | { type: 'DELETE_SEARCH_INDEX'; indexId: string }
  | { type: 'CANCEL_EDIT_INDEX' }

  // Search test events
  | { type: 'TEST_SEARCH_INDEX'; indexId: string }
  | { type: 'UPDATE_TEST_QUERY'; query: string }
  | { type: 'EXECUTE_TEST_SEARCH' }
  | { type: 'CANCEL_TEST_SEARCH' }

  // Legacy collection events (kept for CreateView/EditView compatibility)
  | { type: 'CREATE_COLLECTION'; name: string; description?: string; parentId?: string }

  // Tree view events
  | { type: 'EXPAND_FOLDER'; folderId: string }
  | { type: 'COLLAPSE_FOLDER'; folderId: string }

  // File browser events
  | { type: 'NAVIGATE_TO_FOLDER'; folderId: string | null }
  | { type: 'DOUBLE_CLICK_ITEM'; item: LibraryItem }
  | { type: 'SELECT_ITEMS'; itemIds: string[] }
  | { type: 'RENAME_ITEM'; itemId: string; name: string }
  | { type: 'DELETE_SELECTED_ITEMS' }
  | { type: 'CREATE_FOLDER'; name: string }
  | { type: 'SORT_BY'; column: 'name' | 'modified' | 'size' | 'kind' }
  | { type: 'MOVE_ITEMS'; itemIds: string[]; targetFolderId: string | null }
  | { type: 'SEARCH'; query: string }
  | { type: 'BREADCRUMB_CLICK'; folderId: string | null }
  | { type: 'CLEAR_ITEM_TO_EDIT' }
  // Symlink events
  | { type: 'CREATE_SYMLINK'; symlinkPath: string }
  | { type: 'REFRESH_FOLDER'; folderId: string }
  | { type: 'RELINK_SYMLINK'; collectionId: string; newPath: string }
  | { type: 'REMOVE_BROKEN_SYMLINK'; collectionId: string }
  // Symlink update event (from backend, after re-link)
  | { type: 'SYMLINK_UPDATED'; data: { collection: CollectionDTO } }
  // Import/Export events
  | { type: 'LIBRARY.IMPORT'; directory: string }
  | { type: 'LIBRARY.RESET_IMPORT_STATUS' }
  | { type: 'LIBRARY.EXPORT'; directory: string; format: 'markdown' | 'json' }
  | { type: 'LIBRARY.RESET_EXPORT_STATUS' }
  | { type: 'LIBRARY_IMPORTED'; count: number; errors?: string[] }
  | { type: 'LIBRARY_IMPORT_FAILED'; errors: string[] }
  | { type: 'LIBRARY_EXPORTED'; filePath: string; itemCount: number }
  | { type: 'LIBRARY_EXPORT_FAILED'; errors: string[] }
  | { type: 'NAVIGATE_BACK' }
  | { type: 'NAVIGATE_FORWARD' }
  | OutgoingLibraryEvents

export const librarySystem = setup({
  types: {
    context: {} as LibraryContext,
    events: {} as LibraryEvents,
  },
  actions: {
    // File browser actions
    requestFolderContents: ({ context }) => {
      trpc.bus.send.mutate({
        systemId: id,
        type: 'GET_FOLDER_CONTENTS',
        folderId: context.currentFolderId,
      })
    },
    navigateToFolder: ({ event }) => {
      if (event.type === 'NAVIGATE_TO_FOLDER' || event.type === 'BREADCRUMB_CLICK') {
        trpc.bus.send.mutate({
          systemId: id,
          type: 'NAVIGATE_TO_FOLDER',
          folderId: event.folderId,
        })
      }
    },
    handleDoubleClick: ({ context, event, self }) => {
      if (event.type === 'DOUBLE_CLICK_ITEM') {
        if (event.item.type === 'folder') {
          trpc.bus.send.mutate({
            systemId: id,
            type: 'NAVIGATE_TO_FOLDER',
            folderId: event.item.id,
          })
        } else if (event.item.type === 'document') {
          const docItem = event.item as DocumentItem
          // Symlink documents: fetch from backend (routes to filesystem)
          if (docItem.isSymlinked || event.item.id.startsWith('symlink:')) {
            trpc.bus.send.mutate({
              systemId: id,
              type: 'GET_DOCUMENT',
              id: event.item.id,
            })
          } else {
            // Open edit view for regular documents
            self.send({ type: 'EDIT_DOCUMENT', documentId: event.item.id })
          }
        }
      }
    },
    createDocument: ({ context, event }) => {
      if (event.type === 'SAVE_DOCUMENT') {
        const targetCollectionId = event.collectionId?.trim() || context.currentFolderId || undefined

        if (event.tags?.length) tagStorage.addTags(event.tags)

        trpc.bus.send.mutate({
          systemId: id,
          type: 'CREATE_DOCUMENT',
          name: event.name,
          content: event.content,
          tags: event.tags,
          collectionId: targetCollectionId,
        })
      }
    },
    createFolder: ({ context, event }) => {
      if (event.type === 'CREATE_FOLDER') {
        trpc.bus.send.mutate({
          systemId: id,
          type: 'CREATE_COLLECTION',
          name: event.name,
          parentId: context.currentFolderId || undefined,
        })
      }
    },
    deleteSelectedItems: ({ context }) => {
      if (context.selectedItems.length > 0) {
        trpc.bus.send.mutate({
          systemId: id,
          type: 'DELETE_ITEMS',
          ids: context.selectedItems,
        })
      }
    },
    moveItems: ({ event }) => {
      if (event.type === 'MOVE_ITEMS') {
        trpc.bus.send.mutate({
          systemId: id,
          type: 'MOVE_ITEMS',
          ids: event.itemIds,
          targetFolderId: event.targetFolderId,
        })
      }
    },
    // Tree view actions
    expandFolder: assign(({ context, event }) => {
      const folderId = (event as any).folderId as string
      const alreadyExpanded = context.expandedFolderIds.includes(folderId)
      if (alreadyExpanded) return {}
      const isCached = folderId in context.expandedFolderChildren
      return {
        expandedFolderIds: [...context.expandedFolderIds, folderId],
        loadingFolderIds: isCached
          ? context.loadingFolderIds
          : [...context.loadingFolderIds, folderId],
      }
    }),
    requestTreeChildren: ({ context, event }) => {
      const folderId = (event as any).folderId as string
      if (folderId in context.expandedFolderChildren) return
      trpc.bus.send.mutate({
        systemId: id,
        type: 'GET_FOLDER_CONTENTS',
        folderId,
      })
    },
    collapseFolder: assign(({ context, event }) => {
      const folderId = (event as any).folderId as string
      return {
        expandedFolderIds: context.expandedFolderIds.filter(id => id !== folderId),
        loadingFolderIds: context.loadingFolderIds.filter(id => id !== folderId),
      }
    }),
    clearTreeCache: assign({
      expandedFolderIds: [],
      expandedFolderChildren: {},
      loadingFolderIds: [],
    }),
    invalidateTreeCache: assign(({ context }) => ({
      expandedFolderChildren: {},
      loadingFolderIds: [...context.expandedFolderIds],
    })),
    refetchExpandedFolders: ({ context }) => {
      for (const folderId of context.expandedFolderIds) {
        trpc.bus.send.mutate({
          systemId: id,
          type: 'GET_FOLDER_CONTENTS',
          folderId,
        })
      }
    },

    renameItem: ({ context, event }) => {
      if (event.type === 'RENAME_ITEM') {
        const item = context.items.find(i => i.id === event.itemId)
        const itemType = item?.type === 'folder' ? 'folder' : 'document'

        trpc.bus.send.mutate({
          systemId: id,
          type: 'RENAME_ITEM',
          id: event.itemId,
          name: event.name,
          itemType: itemType,
        })
      }
    },

    // State update actions
    setFolderContents: assign(({ context, event }) => {
      if (event.type !== 'FOLDER_CONTENTS_LOADED') {
        return {}
      }
      const { data } = event
      const items = data.items || []
      const responseFolderId = data.currentFolderId || null

      // Check if this is a tree expansion response
      if (responseFolderId && context.loadingFolderIds.includes(responseFolderId)) {
        return {
          expandedFolderChildren: {
            ...context.expandedFolderChildren,
            [responseFolderId]: items,
          },
          loadingFolderIds: context.loadingFolderIds.filter(id => id !== responseFolderId),
        }
      }

      // Normal navigation response
      const documents = items
        .filter((item): item is DocumentItem => item.type === 'document')
        .map(documentItemToDTO)
      tagStorage.updateTagsFromDocuments(documents)

      // Detect broken symlink state
      const isBroken = data.isBroken ?? false
      const lastKnownPath = data.lastKnownPath ?? null

      // Detect symlink context
      const hasSymlinkedItems = items.some(item => (item as any).isSymlinked)
      const isInSymlinkContext = isBroken || hasSymlinkedItems || (responseFolderId?.startsWith('symlink:') ?? false)

      // Find the symlink root ID
      let currentSymlinkRootId: string | null = null
      if (isInSymlinkContext && responseFolderId) {
        const parsed = parseSymlinkId(responseFolderId)
        currentSymlinkRootId = parsed ? parsed.rootId : responseFolderId
      }

      // Derive symlinkBasePath from symlinked items
      let symlinkBasePath: string | null = null
      if (isInSymlinkContext && items.length > 0) {
        const symlinkItem = items.find(i => (i as any).isSymlinked)
        if (symlinkItem) {
          const fullPath = (symlinkItem as any).symlinkPath || (symlinkItem as any).filePath
          if (fullPath && symlinkItem.name) {
            const parsed = parseSymlinkId(symlinkItem.id)
            if (parsed) {
              if (parsed.relPath) {
                const idx = fullPath.lastIndexOf(parsed.relPath)
                if (idx > 0) symlinkBasePath = fullPath.slice(0, idx - 1)
              } else {
                symlinkBasePath = fullPath.slice(0, fullPath.length - symlinkItem.name.length - 1)
              }
            }
          }
        }
      }

      return {
        items,
        documents,
        currentFolderId: responseFolderId,
        currentPath: data.currentPath || [],
        breadcrumbs: data.breadcrumbs || [],
        searchIndices: data.searchIndices || [],
        isInSymlinkContext,
        currentSymlinkRootId,
        symlinkBasePath,
        isBroken,
        lastKnownPath,
      }
    }),
    updateNavigation: assign(({ event, context }) => {
      const folderId = (event as any).data.folderId || null;
      return {
        currentFolderId: folderId,
        currentPath: (event as any).data.path || [],
        navHistory: pushNavHistory(context.navHistory, folderId),
      };
    }),
    selectItems: assign({
      selectedItems: ({ event }) => event.type === 'SELECT_ITEMS' ? event.itemIds || [] : [],
      selectedDocument: ({ event, context }) => {
        if (event.type === 'SELECT_ITEMS' && event.itemIds?.length === 1) {
          const item = findItemById(context, event.itemIds[0])
          return item?.type === 'document' ? documentItemToDTO(item as DocumentItem) : null
        }
        return null
      }
    }),
    setSortOrder: assign({
      sortBy: ({ event }) => (event as any).column || 'name',
      sortDirection: ({ context, event }) => {
        const column = (event as any).column
        // Toggle direction if same column, otherwise default to 'asc'
        return context.sortBy === column && context.sortDirection === 'asc' ? 'desc' : 'asc'
      },
    }),
    clearSelection: assign({
      selectedItems: [],
      selectedDocument: null,
    }),
    selectNewItemOrClear: assign({
      selectedItems: ({ context }) =>
        context.newItemId ? [context.newItemId] : [],
      selectedDocument: null,
    }),

    requestCollections: () => {
      trpc.bus.send.mutate({
        systemId: id,
        type: 'LIST_COLLECTIONS',
      })
    },
    updateDocument: ({ context, event }) => {
      if (event.type === 'SAVE_DOCUMENT' && context.editingDocument) {
        // Update tags in localStorage
        const oldTags = context.editingDocument.tags || []
        const newTags = event.tags || []

        const removed = oldTags.filter(tag => !newTags.includes(tag))
        const added = newTags.filter(tag => !oldTags.includes(tag))

        if (removed.length) tagStorage.removeTags(removed)
        if (added.length) tagStorage.addTags(added)

        trpc.bus.send.mutate({
          systemId: id,
          type: 'UPDATE_DOCUMENT',
          id: context.editingDocument.id,
          name: event.name,
          content: event.content,
          tags: event.tags,
          collectionId: event.collectionId,
        })
      }
    },

    setEditingDocument: assign({
      editingDocument: ({ context, event }) => {
        if (event.type === 'EDIT_DOCUMENT') {
          // First try to find in legacy documents array
          const legacyDoc = context.documents.find((doc) => doc.id === event.documentId)
          if (legacyDoc) {
            return legacyDoc
          }

          // Otherwise, look in the new items array and convert to DocumentDTO format
          const item = findItemById(context, event.documentId)
          if (item && item.type === 'document') {
            // Convert DocumentItem to DocumentDTO format for compatibility with EditView
            return {
              id: item.id,
              name: item.name,
              content: item.content,
              shortCode: item.shortCode,
              tags: item.tags,
              collectionId: item.parentId,
              createdAt: item.createdAt,
              updatedAt: item.updatedAt,
            } as DocumentDTO
          }
        }
        return undefined
      },
    }),
    clearEditingDocument: assign({
      editingDocument: undefined,
    }),
    sendDeleteDocument: ({ event }) => {
      const ev = event as { type: 'DELETE_DOCUMENT'; documentId: string };
      trpc.bus.send.mutate({
        systemId: id,
        type: 'DELETE_ITEMS',
        ids: [ev.documentId],
      });
    },
    updateEditingDocument: assign({
      editingDocument: ({ context, event }) => {
        if (event.type === 'DOCUMENT_UPDATED' && context.editingDocument?.id === event.data.document.id) {
          return event.data.document
        }
        return context.editingDocument
      },
    }),
    setDocuments: assign({
      documents: ({ event }) => {
        if (event.type === 'DOCUMENTS_LOADED') {
          const documents = event.data.documents
          // Sync tags to localStorage
          tagStorage.updateTagsFromDocuments(documents)
          return documents
        }
        return []
      },
    }),
    setCollections: assign({
      collections: ({ event }) => {
        if (event.type === 'COLLECTIONS_LOADED') {
          return event.data.collections
        }
        return []
      },
    }),

    // [SEARCH_INDEX_FF] Search index actions — commented out
    // requestSearchIndices: ({ context }) => {
    //   trpc.bus.send.mutate({
    //     systemId: id,
    //     type: 'LIST_SEARCH_INDICES',
    //     folderId: context.currentFolderId,
    //   })
    // },
    // setSearchIndices: assign({
    //   searchIndices: ({ event }) => {
    //     if (event.type === 'SEARCH_INDICES_LOADED') {
    //       return event.data.indices
    //     }
    //     return []
    //   },
    // }),
    // saveSearchIndex: ({ context, event }) => {
    //   if (event.type === 'SAVE_SEARCH_INDEX') {
    //     trpc.bus.send.mutate({
    //       systemId: id,
    //       type: 'CREATE_SEARCH_INDEX',
    //       config: event.config,
    //       folderId: context.currentFolderId,
    //     })
    //   }
    // },
    // updateSearchIndex: ({ event }) => {
    //   if (event.type === 'UPDATE_SEARCH_INDEX') {
    //     trpc.bus.send.mutate({
    //       systemId: id,
    //       type: 'UPDATE_SEARCH_INDEX',
    //       id: event.indexId,
    //       config: event.config,
    //     })
    //   }
    // },
    // deleteSearchIndex: ({ event }) => {
    //   if (event.type === 'DELETE_SEARCH_INDEX') {
    //     trpc.bus.send.mutate({
    //       systemId: id,
    //       type: 'DELETE_SEARCH_INDEX',
    //       id: event.indexId,
    //     })
    //   }
    // },
    // setEditingIndex: assign({
    //   editingIndexId: ({ event }) => {
    //     if (event.type === 'EDIT_SEARCH_INDEX') {
    //       return event.indexId
    //     }
    //     return undefined
    //   },
    //   editingIndex: ({ context, event }) => {
    //     if (event.type === 'EDIT_SEARCH_INDEX') {
    //       return context.searchIndices.find(idx => idx.id === event.indexId)
    //     }
    //     return undefined
    //   },
    // }),
    // clearEditingIndex: assign({
    //   editingIndexId: undefined,
    //   editingIndex: undefined,
    // }),
    //
    // // Search test actions
    // setTestingIndex: assign({
    //   testingIndexId: ({ event }) => {
    //     if (event.type === 'TEST_SEARCH_INDEX') {
    //       return event.indexId
    //     }
    //     return undefined
    //   },
    //   testingIndex: ({ context, event }) => {
    //     if (event.type === 'TEST_SEARCH_INDEX') {
    //       return context.searchIndices.find(idx => idx.id === event.indexId)
    //     }
    //     return undefined
    //   },
    //   testQuery: '',
    //   testResults: [],
    //   isSearching: false,
    // }),
    // updateTestQuery: assign({
    //   testQuery: ({ event }) => {
    //     if (event.type === 'UPDATE_TEST_QUERY') {
    //       return event.query
    //     }
    //     return ''
    //   },
    // }),
    // executeTestSearch: ({ context }) => {
    //   if (context.testingIndexId && context.testQuery) {
    //     trpc.bus.send.mutate({
    //       systemId: id,
    //       type: 'SEARCH_IN_INDEX',
    //       indexId: context.testingIndexId,
    //       query: context.testQuery,
    //       limit: 10,
    //     })
    //   }
    // },
    // setSearching: assign({
    //   isSearching: true,
    // }),
    // setSearchResults: assign({
    //   testResults: ({ event }) => {
    //     if (event.type === 'SEARCH_RESULTS') {
    //       return event.data.results
    //     }
    //     return []
    //   },
    //   isSearching: false,
    // }),
    // clearTestSearch: assign({
    //   testingIndexId: undefined,
    //   testingIndex: undefined,
    //   testQuery: '',
    //   testResults: [],
    //   isSearching: false,
    // }),
    // Refresh folder (invalidate cache and re-fetch)
    refreshFolder: assign(({ context, event }) => {
      const folderId = (event as any).folderId as string
      const { [folderId]: _, ...rest } = context.expandedFolderChildren
      return {
        expandedFolderChildren: rest,
        loadingFolderIds: [...context.loadingFolderIds, folderId],
      }
    }),
    requestRefreshFolder: ({ event }) => {
      const folderId = (event as any).folderId as string
      trpc.bus.send.mutate({
        systemId: id,
        type: 'GET_FOLDER_CONTENTS',
        folderId,
      })
    },

    // Symlink actions
    createSymlink: ({ context, event }) => {
      if (event.type === 'CREATE_SYMLINK') {
        const pathParts = event.symlinkPath.split(/[/\\]/).filter(Boolean)
        const folderName = pathParts[pathParts.length - 1] || 'Symlink'
        trpc.bus.send.mutate({
          systemId: id,
          type: 'CREATE_SYMLINK_COLLECTION',
          name: folderName,
          symlinkPath: event.symlinkPath,
          parentId: context.currentFolderId || undefined,
        })
      }
    },
    relinkSymlink: ({ event }) => {
      if (event.type === 'RELINK_SYMLINK') {
        trpc.bus.send.mutate({
          systemId: id,
          type: 'UPDATE_SYMLINK_PATH',
          collectionId: event.collectionId,
          newPath: event.newPath,
        } as any)
      }
    },
    removeBrokenSymlink: ({ event }) => {
      if (event.type === 'REMOVE_BROKEN_SYMLINK') {
        trpc.bus.send.mutate({
          systemId: id,
          type: 'DELETE_ITEMS',
          ids: [event.collectionId],
        } as any)
      }
    },
    /* ── Library Import actions ────────────────────────────── */
    setImportingLibrary: assign(({ context }) => ({
      libraryImport: {
        ...context.libraryImport,
        status: 'importing' as const,
      },
    })),

    sendImportLibrary: ({ event }) => {
      if (event.type === 'LIBRARY.IMPORT') {
        trpc.bus.send.mutate({
          systemId: id,
          type: 'IMPORT_LIBRARY',
          directory: event.directory,
        } as any)
      }
    },

    handleLibraryImported: assign(({ event }) => {
      if (event.type === 'LIBRARY_IMPORTED') {
        return {
          libraryImport: {
            status: 'success' as const,
            errors: event.errors || [],
            importedCount: event.count,
          },
        }
      }
      return {}
    }),

    handleLibraryImportFailed: assign(({ event }) => {
      if (event.type === 'LIBRARY_IMPORT_FAILED') {
        return {
          libraryImport: {
            status: 'error' as const,
            errors: event.errors,
            importedCount: 0,
          },
        }
      }
      return {}
    }),

    resetImportLibraryStatus: assign({
      libraryImport: { status: 'idle' as const, errors: [] as string[], importedCount: 0 },
    }),

    /* ── Library Export actions ────────────────────────────── */
    setExportingLibrary: assign(({ context }) => ({
      libraryExport: {
        ...context.libraryExport,
        status: 'exporting' as const,
      },
    })),

    sendExportLibrary: ({ event }) => {
      if (event.type === 'LIBRARY.EXPORT') {
        trpc.bus.send.mutate({
          systemId: id,
          type: 'EXPORT_LIBRARY',
          directory: event.directory,
          format: event.format,
        } as any)
      }
    },

    handleLibraryExported: assign(({ event }) => {
      if (event.type === 'LIBRARY_EXPORTED') {
        return {
          libraryExport: {
            status: 'success' as const,
            errors: [] as string[],
            filePath: event.filePath,
            itemCount: event.itemCount,
          },
        }
      }
      return {}
    }),

    handleLibraryExportFailed: assign(({ event }) => {
      if (event.type === 'LIBRARY_EXPORT_FAILED') {
        return {
          libraryExport: {
            status: 'error' as const,
            errors: event.errors,
            filePath: '',
            itemCount: 0,
          },
        }
      }
      return {}
    }),

    resetExportLibraryStatus: assign({
      libraryExport: { status: 'idle' as const, errors: [] as string[], filePath: '', itemCount: 0 },
    }),

    // ? think we're sending duplicate documents data on startup
    setConnectedData: assign({
      documents: ({ event }) => {
        if (event.type === 'LIBRARY_CONNECTED') {
          const documents = event.data.documents
          // Sync tags to localStorage for backward compatibility
          tagStorage.updateTagsFromDocuments(documents)
          return documents
        }
        return []
      },
      collections: ({ event }) => {
        if (event.type === 'LIBRARY_CONNECTED') {
          return event.data.collections
        }
        return []
      },
      settings: ({ event }) => {
        if (event.type === 'LIBRARY_CONNECTED') {
          return event.data.settings
        }
        return undefined
      },
    }),
  },
  guards: {
    targetIs,
  },
}).createMachine({
  id: 'library',
  initial: 'browser',
  context: {
    // Core view state
    currentView: 'browser',
    editingDocument: undefined,

    // File browser fields
    items: [],
    currentFolderId: null,
    currentPath: [],
    selectedItems: [],
    selectedDocument: null,
    sortBy: 'name',
    sortDirection: 'asc',
    breadcrumbs: [],
    editingItem: undefined,
    itemToEdit: null,
    newItemId: null,

    // Tree view fields
    expandedFolderIds: [],
    expandedFolderChildren: {},
    loadingFolderIds: [],

    // Legacy fields (for CreateView/EditView compatibility)
    documents: [],
    collections: [],
    selectedCollectionId: undefined,

    // Search index fields
    searchIndices: [],
    editingIndexId: undefined,
    editingIndex: undefined,

    // Search test fields
    testingIndexId: undefined,
    testingIndex: undefined,
    testQuery: '',
    testResults: [],
    isSearching: false,

    // Symlink context
    isInSymlinkContext: false,
    currentSymlinkRootId: null,
    symlinkBasePath: null,
    isBroken: false,
    lastKnownPath: null,

    // Settings
    settings: undefined,

    // Import/Export
    libraryImport: { status: 'idle' as const, errors: [], importedCount: 0 },
    libraryExport: { status: 'idle' as const, errors: [], filePath: '', itemCount: 0 },
    navHistory: createNavHistory<string | null>(null),
  },
  on: {
    PLUGIN_ACTIVATED: {
      actions: ['requestFolderContents', 'requestCollections'],
    },
    LIBRARY_CONNECTED: {
      actions: ['setConnectedData'],
    },
    VIEW_BROWSER: {
      target: '.browser',
    },

    // File browser events
    FOLDER_CONTENTS_LOADED: {
      // actions: ['setFolderContents', 'clearSelection', 'requestSearchIndices'], // [SEARCH_INDEX_FF] removed 'requestSearchIndices'
      actions: ['setFolderContents', 'selectNewItemOrClear'],
    },
    NAVIGATION_CHANGED: {
      actions: 'updateNavigation',
    },
    NAVIGATE_TO_FOLDER: {
      actions: ['navigateToFolder', 'clearSelection', assign({
        currentFolderId: ({ event }) => event.folderId,
        newItemId: null,
      })],
    },
    BREADCRUMB_CLICK: {
      actions: ['navigateToFolder', 'clearSelection', assign({
        currentFolderId: ({ event }) => event.folderId,
        newItemId: null,
      })],
    },
    NAVIGATE_BACK: {
      guard: ({ context }) => canGoBack(context.navHistory),
      actions: [
        assign(({ context }) => {
          const result = goBack(context.navHistory)!;
          return { navHistory: result.history, currentFolderId: result.entry };
        }),
        ({ context }) => {
          trpc.bus.send.mutate({ systemId: id, type: 'NAVIGATE_TO_FOLDER', folderId: context.currentFolderId });
        },
        'clearSelection',
      ],
    },
    NAVIGATE_FORWARD: {
      guard: ({ context }) => canGoForward(context.navHistory),
      actions: [
        assign(({ context }) => {
          const result = goForward(context.navHistory)!;
          return { navHistory: result.history, currentFolderId: result.entry };
        }),
        ({ context }) => {
          trpc.bus.send.mutate({ systemId: id, type: 'NAVIGATE_TO_FOLDER', folderId: context.currentFolderId });
        },
        'clearSelection',
      ],
    },
    DOUBLE_CLICK_ITEM: {
      actions: ['handleDoubleClick', 'clearSelection', assign({ newItemId: null })],
    },
    SELECT_ITEMS: {
      actions: ['selectItems', assign({ newItemId: null })],
    },
    SORT_BY: {
      actions: 'setSortOrder',
    },
    DELETE_SELECTED_ITEMS: {
      actions: 'deleteSelectedItems',
    },
    RENAME_ITEM: {
      actions: 'renameItem',
    },
    CREATE_FOLDER: {
      actions: 'createFolder',
    },
    MOVE_ITEMS: {
      actions: 'moveItems',
    },
    CLEAR_ITEM_TO_EDIT: {
      actions: assign({
        itemToEdit: null
      })
    },

    // Tree view events
    EXPAND_FOLDER: {
      actions: ['expandFolder', 'requestTreeChildren'],
    },
    COLLAPSE_FOLDER: {
      actions: 'collapseFolder',
    },

    CREATE_SYMLINK: {
      actions: 'createSymlink',
    },
    REFRESH_FOLDER: {
      actions: ['refreshFolder', 'requestRefreshFolder'],
    },
    RELINK_SYMLINK: {
      actions: ['relinkSymlink'],
    },
    REMOVE_BROKEN_SYMLINK: {
      actions: ['removeBrokenSymlink', assign({ isBroken: false, lastKnownPath: null })],
    },
    SYMLINK_UPDATED: {
      actions: ['requestFolderContents', 'requestCollections'],
    },

    // Import/Export events
    'LIBRARY.IMPORT': {
      actions: ['setImportingLibrary', 'sendImportLibrary'],
    },
    'LIBRARY.RESET_IMPORT_STATUS': {
      actions: 'resetImportLibraryStatus',
    },
    LIBRARY_IMPORTED: {
      actions: ['handleLibraryImported', 'requestFolderContents', 'requestCollections'],
    },
    LIBRARY_IMPORT_FAILED: {
      actions: 'handleLibraryImportFailed',
    },
    'LIBRARY.EXPORT': {
      actions: ['setExportingLibrary', 'sendExportLibrary'],
    },
    'LIBRARY.RESET_EXPORT_STATUS': {
      actions: 'resetExportLibraryStatus',
    },
    LIBRARY_EXPORTED: {
      actions: 'handleLibraryExported',
    },
    LIBRARY_EXPORT_FAILED: {
      actions: 'handleLibraryExportFailed',
    },

    // Document/collection response events
    DOCUMENT_LOADED: {
      target: '.edit',
      actions: assign({
        editingDocument: ({ event }) =>
          event.type === 'DOCUMENT_LOADED' ? event.data.document : undefined,
      }),
    },
    DOCUMENT_CREATED: {
      actions: ['requestFolderContents', 'invalidateTreeCache', 'refetchExpandedFolders'],
    },
    DOCUMENT_UPDATED: {
      actions: ['requestFolderContents', 'updateEditingDocument'],
    },
    COLLECTION_CREATED: {
      actions: [
        'requestFolderContents',
        'requestCollections',
        'invalidateTreeCache',
        'refetchExpandedFolders',
        assign({
          itemToEdit: ({ event }) => {
            // Set the new folder to be edited
            const createdEvent = event as OutgoingLibraryEvents & { type: 'COLLECTION_CREATED'; data: { collection: CollectionDTO } }
            return createdEvent.data?.collection?.id || null
          },
          newItemId: ({ event }) => {
            const createdEvent = event as OutgoingLibraryEvents & { type: 'COLLECTION_CREATED'; data: { collection: CollectionDTO } }
            return createdEvent.data?.collection?.id || null
          }
        })
      ],
    },
    ITEM_RENAMED: {
      actions: ['requestFolderContents', 'invalidateTreeCache', 'refetchExpandedFolders'],
    },
    ITEMS_DELETED: {
      actions: ['requestFolderContents', 'requestCollections', 'invalidateTreeCache', 'refetchExpandedFolders'],
    },
    ITEMS_MOVED: {
      actions: ['requestFolderContents', 'requestCollections', 'invalidateTreeCache', 'refetchExpandedFolders'],
    },
    // Legacy events for backward compatibility
    DOCUMENTS_LOADED: {
      actions: 'setDocuments',
    },
    COLLECTIONS_LOADED: {
      actions: 'setCollections',
    },

    // [SEARCH_INDEX_FF] Search index events — commented out
    // SEARCH_INDICES_LOADED: { actions: 'setSearchIndices' },
    // SEARCH_INDEX_CREATED: { actions: 'requestSearchIndices' },
    // SEARCH_INDEX_UPDATED: { actions: 'requestSearchIndices' },
    // SEARCH_INDEX_DELETED: { actions: 'requestSearchIndices' },
    // SEARCH_RESULTS: { actions: 'setSearchResults' },
    ...TRAIL_CLICK([
      ['.browser', 'browser'],
      ['.create', 'create'],
      ['.edit', 'edit'],
      // [SEARCH_INDEX_FF] ['.createIndex', 'createIndex'],
      // [SEARCH_INDEX_FF] ['.editIndex', 'editIndex'],
      // [SEARCH_INDEX_FF] ['.testIndex', 'testIndex'],
    ]),
  },
  states: {
    browser: {
      entry: assign({ currentView: 'browser' }),
      meta: breadcrumb('browser', 'Library', true),
      on: {
        CREATE_DOCUMENT: [
          {
            guard: ({ context }) => context.isInSymlinkContext,
            // Stay in browser, create file inline via unified event
            actions: ({ context }) => {
              if (context.currentFolderId) {
                trpc.bus.send.mutate({
                  systemId: id,
                  type: 'CREATE_DOCUMENT',
                  name: 'New Document.txt',
                  content: [],
                  tags: [],
                  collectionId: context.currentFolderId,
                })
              }
            },
          },
          { target: 'create' },
        ],
        EDIT_DOCUMENT: {
          target: 'edit',
          actions: ['setEditingDocument', 'clearSelection'],
        },
        // [SEARCH_INDEX_FF] Search index transitions — commented out
        // CREATE_SEARCH_INDEX: 'createIndex',
        // EDIT_SEARCH_INDEX: { target: 'editIndex', actions: 'setEditingIndex' },
        // TEST_SEARCH_INDEX: { target: 'testIndex', actions: 'setTestingIndex' },
      },
    },
    create: {
      entry: assign({ currentView: 'create' }),
      meta: breadcrumb('create', 'New Document'),
      on: {
        SAVE_DOCUMENT: {
          target: 'browser',
          actions: 'createDocument',
        },
        CANCEL_EDIT: 'browser',
      },
    },
    edit: {
      entry: assign({ currentView: 'edit' }),
      meta: {
        ...breadcrumbWithParams<LibraryContext>({
          target: 'edit',
          getLabel: (ctx) => `${ctx.editingDocument?.name || 'Document'}`,
        }),
        ...contextMenuFn<LibraryContext>((ctx) => {
          if (!ctx.editingDocument) return []
          return [
            { label: 'Delete Document', icon: Trash2, event: { type: 'DELETE_DOCUMENT' as const, documentId: ctx.editingDocument.id }, iconColor: 'text-red-400', confirm: `Are you sure you want to delete "${ctx.editingDocument.name || 'this document'}"?` },
          ]
        }),
      },
      on: {
        SAVE_DOCUMENT: {
          target: 'browser',
          actions: ['updateDocument', 'clearEditingDocument'],
        },
        CANCEL_EDIT: {
          target: 'browser',
          actions: 'clearEditingDocument',
        },
        DELETE_DOCUMENT: {
          target: 'browser',
          actions: ['sendDeleteDocument', 'clearEditingDocument'],
        },
      },
    },
    // [SEARCH_INDEX_FF] Search index states — commented out
    // createIndex: {
    //   entry: assign({ currentView: 'create-index' }),
    //   meta: breadcrumb('createIndex', 'Create Search Index'),
    //   on: {
    //     SAVE_SEARCH_INDEX: {
    //       target: 'browser',
    //       actions: 'saveSearchIndex',
    //     },
    //     CANCEL_CREATE_INDEX: 'browser',
    //   },
    // },
    // editIndex: {
    //   entry: assign({ currentView: 'edit-index' }),
    //   meta: breadcrumbWithParams<LibraryContext>({
    //     target: 'editIndex',
    //     getLabel: (ctx) => `${ctx.editingIndex?.name || 'Index'}`,
    //   }),
    //   on: {
    //     UPDATE_SEARCH_INDEX: {
    //       target: 'browser',
    //       actions: ['updateSearchIndex', 'clearEditingIndex'],
    //     },
    //     CANCEL_EDIT_INDEX: {
    //       target: 'browser',
    //       actions: 'clearEditingIndex',
    //     },
    //   },
    // },
    // testIndex: {
    //   entry: assign({ currentView: 'test-index' }),
    //   meta: breadcrumbWithParams<LibraryContext>({
    //     target: 'testIndex',
    //     getLabel: (ctx) => `${ctx.testingIndex?.name || 'Index'}`,
    //   }),
    //   on: {
    //     UPDATE_TEST_QUERY: {
    //       actions: 'updateTestQuery',
    //     },
    //     EXECUTE_TEST_SEARCH: {
    //       actions: ['setSearching', 'executeTestSearch'],
    //     },
    //     CANCEL_TEST_SEARCH: {
    //       target: 'browser',
    //       actions: 'clearTestSearch',
    //     },
    //   },
    // },
  },
})
