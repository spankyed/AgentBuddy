import { setup, assign, type ActorRefFrom } from 'xstate'
import type { DocumentDTO, CollectionDTO, LibraryIndex, LibraryItem, DocumentItem, FolderContents, BreadcrumbItem, SearchIndex } from '@/__generated__/types'
import type { LibraryContext, LibraryInboxEvent } from './types'
import type { OutgoingLibraryEvents } from '@/features/library/be/system'
import type { SearchIndexFormData } from './types/search-index'
import { sendToSystem } from '@/__generated__/events'
import { Trash2 } from 'lucide-vue-next'
import { contextMenuFn } from '@abuddy/sdk/fe'
import breadcrumb, { breadcrumbWithParams } from '@abuddy/sdk/fe'
import {
  targetIs,
  TRAIL_CLICK,
  type TrailClickEvent,
} from '@abuddy/sdk/fe'
import { tagStorage } from './services/tagStorage'
import { type NavHistory, createNavHistory, pushNavHistory, goBack, goForward, canGoBack, canGoForward } from '@abuddy/sdk/fe'

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

export const id = 'library' as const;
import type { SnapshotFrom } from 'xstate'
import type { ContentSection } from '@/features/library/be/types';

/** The library plugin's actor, as its own components reach it with `usePlugin<LibraryActor>()` */
export type LibraryActor = ActorRefFrom<typeof librarySystem>


export type LibraryEvents =
  | { type: 'PLUGIN_ACTIVATED' }
  | { type: 'TRAIL_CLICK'; trail: string[] }
  | { type: 'VIEW_BROWSER' }

  // Document events
  | { type: 'CREATE_DOCUMENT' }
  | LibraryInboxEvent
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

  // Collection events
  | { type: 'CREATE_COLLECTION'; name: string; description?: string; parentId?: string }

  // Tree view events
  | { type: 'EXPAND_FOLDER'; folderId: string }
  | { type: 'COLLAPSE_FOLDER'; folderId: string }

  // File browser events
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
      sendToSystem(id, {
        type: 'GET_FOLDER_CONTENTS',
        folderId: context.currentFolderId,
      })
    },
    navigateToFolder: ({ event }) => {
      if (event.type === 'NAVIGATE_TO_FOLDER' || event.type === 'BREADCRUMB_CLICK') {
        sendToSystem(id, {
          type: 'NAVIGATE_TO_FOLDER',
          folderId: event.folderId,
        })
      }
    },
    handleDoubleClick: ({ context, event, self }) => {
      if (event.type === 'DOUBLE_CLICK_ITEM') {
        if (event.item.type === 'folder') {
          sendToSystem(id, {
            type: 'NAVIGATE_TO_FOLDER',
            folderId: event.item.id,
          })
        } else if (event.item.type === 'document') {
          const docItem = event.item as DocumentItem
          // Symlink documents: fetch from backend (routes to filesystem)
          if (docItem.isSymlinked || event.item.id.startsWith('symlink:')) {
            sendToSystem(id, {
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

        sendToSystem(id, {
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
        sendToSystem(id, {
          type: 'CREATE_COLLECTION',
          name: event.name,
          parentId: context.currentFolderId || undefined,
        })
      }
    },
    deleteSelectedItems: ({ context }) => {
      if (context.selectedItems.length > 0) {
        sendToSystem(id, {
          type: 'DELETE_ITEMS',
          ids: context.selectedItems,
        })
      }
    },
    moveItems: ({ event }) => {
      if (event.type === 'MOVE_ITEMS') {
        sendToSystem(id, {
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
      sendToSystem(id, {
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
        sendToSystem(id, {
          type: 'GET_FOLDER_CONTENTS',
          folderId,
        })
      }
    },

    renameItem: ({ context, event }) => {
      if (event.type === 'RENAME_ITEM') {
        const item = context.items.find(i => i.id === event.itemId)
        const itemType = item?.type === 'folder' ? 'folder' : 'document'

        sendToSystem(id, {
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

    requestIndex: () => {
      sendToSystem(id, {
        type: 'GET_LIBRARY_INDEX',
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

        sendToSystem(id, {
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
          // The open folder's items carry the document's content; `requestEditingDocument`
          // fetches it from the backend when the document is somewhere else in the library
          const item = findItemById(context, event.documentId)
          if (item && item.type === 'document') {
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
    /** Fetches the document the edit view needs when the open folder doesn't hold it; DOCUMENT_LOADED fills it in */
    requestEditingDocument: ({ context, event }) => {
      if (event.type !== 'EDIT_DOCUMENT') return
      const item = findItemById(context, event.documentId)
      if (item?.type === 'document') return
      sendToSystem(id, {
        type: 'GET_DOCUMENT',
        id: event.documentId,
      })
    },
    clearEditingDocument: assign({
      editingDocument: undefined,
    }),
    sendDeleteDocument: ({ event }) => {
      const ev = event as { type: 'DELETE_DOCUMENT'; documentId: string };
      sendToSystem(id, {
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

    // [SEARCH_INDEX_FF] Search index actions — commented out
    // requestSearchIndices: ({ context }) => {
    //   sendToSystem(id, {
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
    //     sendToSystem(id, {
    //       type: 'CREATE_SEARCH_INDEX',
    //       config: event.config,
    //       folderId: context.currentFolderId,
    //     })
    //   }
    // },
    // updateSearchIndex: ({ event }) => {
    //   if (event.type === 'UPDATE_SEARCH_INDEX') {
    //     sendToSystem(id, {
    //       type: 'UPDATE_SEARCH_INDEX',
    //       id: event.indexId,
    //       config: event.config,
    //     })
    //   }
    // },
    // deleteSearchIndex: ({ event }) => {
    //   if (event.type === 'DELETE_SEARCH_INDEX') {
    //     sendToSystem(id, {
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
    //     sendToSystem(id, {
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
      sendToSystem(id, {
        type: 'GET_FOLDER_CONTENTS',
        folderId,
      })
    },

    // Symlink actions
    createSymlink: ({ context, event }) => {
      if (event.type === 'CREATE_SYMLINK') {
        const pathParts = event.symlinkPath.split(/[/\\]/).filter(Boolean)
        const folderName = pathParts[pathParts.length - 1] || 'Symlink'
        sendToSystem(id, {
          type: 'CREATE_SYMLINK_COLLECTION',
          name: folderName,
          symlinkPath: event.symlinkPath,
          parentId: context.currentFolderId || undefined,
        })
      }
    },
    relinkSymlink: ({ event }) => {
      if (event.type === 'RELINK_SYMLINK') {
        sendToSystem(id, {
          type: 'UPDATE_SYMLINK_PATH',
          collectionId: event.collectionId,
          newPath: event.newPath,
        })
      }
    },
    removeBrokenSymlink: ({ event }) => {
      if (event.type === 'REMOVE_BROKEN_SYMLINK') {
        sendToSystem(id, {
          type: 'DELETE_ITEMS',
          ids: [event.collectionId],
        })
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
        sendToSystem(id, {
          type: 'IMPORT_LIBRARY',
          directory: event.directory,
        })
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
        sendToSystem(id, {
          type: 'EXPORT_LIBRARY',
          directory: event.directory,
          format: event.format,
        })
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

    setIndex: assign({
      index: ({ context, event }) => {
        if (event.type === 'LIBRARY_INDEX_LOADED') {
          tagStorage.updateTagsFromDocuments(event.data.index.documents)
          return event.data.index
        }
        return context.index
      },
    }),

    setConnectedData: assign({
      index: ({ context, event }) => {
        if (event.type === 'LIBRARY_CONNECTED') {
          tagStorage.updateTagsFromDocuments(event.data.index.documents)
          return event.data.index
        }
        return context.index
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

    index: { documents: [], folders: [] },

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
      actions: ['requestFolderContents', 'requestIndex'],
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
          sendToSystem(id, { type: 'NAVIGATE_TO_FOLDER', folderId: context.currentFolderId });
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
          sendToSystem(id, { type: 'NAVIGATE_TO_FOLDER', folderId: context.currentFolderId });
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
      actions: ['requestFolderContents', 'requestIndex'],
    },

    // Import/Export events
    'LIBRARY.IMPORT': {
      actions: ['setImportingLibrary', 'sendImportLibrary'],
    },
    'LIBRARY.RESET_IMPORT_STATUS': {
      actions: 'resetImportLibraryStatus',
    },
    LIBRARY_IMPORTED: {
      actions: ['handleLibraryImported', 'requestFolderContents', 'requestIndex'],
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
      actions: ['requestFolderContents', 'requestIndex', 'invalidateTreeCache', 'refetchExpandedFolders'],
    },
    DOCUMENT_UPDATED: {
      // A save can change the document's name and tags, both of which the index carries
      actions: ['requestFolderContents', 'requestIndex', 'updateEditingDocument'],
    },
    COLLECTION_CREATED: {
      actions: [
        'requestFolderContents',
        'requestIndex',
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
      actions: ['requestFolderContents', 'requestIndex', 'invalidateTreeCache', 'refetchExpandedFolders'],
    },
    ITEMS_DELETED: {
      actions: ['requestFolderContents', 'requestIndex', 'invalidateTreeCache', 'refetchExpandedFolders'],
    },
    ITEMS_MOVED: {
      actions: ['requestFolderContents', 'requestIndex', 'invalidateTreeCache', 'refetchExpandedFolders'],
    },
    LIBRARY_INDEX_LOADED: {
      actions: 'setIndex',
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
                sendToSystem(id, {
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
          actions: ['setEditingDocument', 'requestEditingDocument', 'clearSelection'],
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
