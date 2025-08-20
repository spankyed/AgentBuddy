import { setup, assign, type ActorRefFrom } from 'xstate'
import type { DocumentDTO, CollectionDTO, OutgoingLibraryEvents, LibraryItem, DocumentItem, FolderContents, BreadcrumbItem, ContentSection, SearchIndex } from '@app/api'
import type { SearchIndexFormData } from './types/search-index'
import { trpc } from '@/core/trpc'
import breadcrumb, { breadcrumbWithParams } from '@/core/breadcrumb'
import {
  targetIs,
  TRAIL_CLICK,
  type TrailClickEvent,
} from '@/core/actors/route-trailer'
import { tagStorage } from './services/tagStorage'

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
  
  // Settings
  settings?: any
}

export type LibraryEvents =
  | { type: 'PLUGIN_ACTIVATED' }
  | { type: 'TRAIL_CLICK'; trail: string[] }
  
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
  
  // File browser events
  | { type: 'NAVIGATE_TO_FOLDER'; folderId: string | null }
  | { type: 'DOUBLE_CLICK_ITEM'; item: LibraryItem }
  | { type: 'SELECT_ITEMS'; itemIds: string[] }
  | { type: 'RENAME_ITEM'; itemId: string; name: string }
  | { type: 'DELETE_SELECTED_ITEMS' }
  | { type: 'CREATE_FOLDER'; name: string }
  | { type: 'SORT_BY'; column: 'name' | 'modified' | 'size' | 'kind' }
  | { type: 'MOVE_ITEMS'; itemIds: string[]; targetFolderId: string }
  | { type: 'REORDER_ITEMS'; itemIds: string[]; targetIndex: number; targetFolderId: string | null }
  | { type: 'SEARCH'; query: string }
  | { type: 'BREADCRUMB_CLICK'; folderId: string | null }
  | { type: 'CLEAR_ITEM_TO_EDIT' }
  | { type: 'ITEMS_REORDERED'; data: { itemIds: string[]; targetFolderId: string | null } }
  | OutgoingLibraryEvents

export const librarySystem = setup({
  types: {
    context: {} as LibraryContext,
    events: {} as LibraryEvents,
  },
  actions: {
    // New file browser actions
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
    handleDoubleClick: ({ event, self }) => {
      if (event.type === 'DOUBLE_CLICK_ITEM') {
        if (event.item.type === 'folder') {
          trpc.bus.send.mutate({
            systemId: id,
            type: 'NAVIGATE_TO_FOLDER',
            folderId: event.item.id,
          })
        } else if (event.item.type === 'document') {
          // Open edit view for documents
          self.send({ type: 'EDIT_DOCUMENT', documentId: event.item.id })
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
    reorderItems: ({ event }) => {
      if (event.type === 'REORDER_ITEMS') {
        trpc.bus.send.mutate({
          systemId: id,
          type: 'REORDER_ITEMS',
          itemIds: event.itemIds,
          targetIndex: event.targetIndex,
          targetFolderId: event.targetFolderId,
        })
      }
    },
    renameItem: ({ context, event }) => {
      if (event.type === 'RENAME_ITEM') {
        // Find the item in the current items list to determine its type
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
    setFolderContents: assign(({ event }) => {
      if (event.type !== 'FOLDER_CONTENTS_LOADED') {
        return {}
      }
      const { data } = event
      const items = data.items || []
      const documents = items
        .filter((item): item is DocumentItem => item.type === 'document')
        .map(documentItemToDTO)
      tagStorage.updateTagsFromDocuments(documents)
      
      return {
        items,
        documents,
        currentFolderId: data.currentFolderId || null,
        currentPath: data.currentPath || [],
        breadcrumbs: data.breadcrumbs || [],
        searchIndices: data.searchIndices || []
      }
    }),
    updateNavigation: assign({
      currentFolderId: ({ event }) => (event as any).data.folderId || null,
      currentPath: ({ event }) => (event as any).data.path || [],
    }),
    selectItems: assign({
      selectedItems: ({ event }) => event.type === 'SELECT_ITEMS' ? event.itemIds || [] : [],
      selectedDocument: ({ event, context }) => {
        if (event.type === 'SELECT_ITEMS' && event.itemIds?.length === 1) {
          const item = context.items.find(i => i.id === event.itemIds[0])
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
          const item = context.items.find((item) => item.id === event.documentId && item.type === 'document')
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
    
    // Search index actions
    requestSearchIndices: ({ context }) => {
      trpc.bus.send.mutate({
        systemId: id,
        type: 'LIST_SEARCH_INDICES',
        folderId: context.currentFolderId,
      })
    },
    setSearchIndices: assign({
      searchIndices: ({ event }) => {
        if (event.type === 'SEARCH_INDICES_LOADED') {
          return event.data.indices
        }
        return []
      },
    }),
    saveSearchIndex: ({ context, event }) => {
      if (event.type === 'SAVE_SEARCH_INDEX') {
        trpc.bus.send.mutate({
          systemId: id,
          type: 'CREATE_SEARCH_INDEX',
          config: event.config,
          folderId: context.currentFolderId,
        })
      }
    },
    updateSearchIndex: ({ event }) => {
      if (event.type === 'UPDATE_SEARCH_INDEX') {
        trpc.bus.send.mutate({
          systemId: id,
          type: 'UPDATE_SEARCH_INDEX',
          id: event.indexId,
          config: event.config,
        })
      }
    },
    deleteSearchIndex: ({ event }) => {
      if (event.type === 'DELETE_SEARCH_INDEX') {
        trpc.bus.send.mutate({
          systemId: id,
          type: 'DELETE_SEARCH_INDEX',
          id: event.indexId,
        })
      }
    },
    setEditingIndex: assign({
      editingIndexId: ({ event }) => {
        if (event.type === 'EDIT_SEARCH_INDEX') {
          return event.indexId
        }
        return undefined
      },
      editingIndex: ({ context, event }) => {
        if (event.type === 'EDIT_SEARCH_INDEX') {
          return context.searchIndices.find(idx => idx.id === event.indexId)
        }
        return undefined
      },
    }),
    clearEditingIndex: assign({
      editingIndexId: undefined,
      editingIndex: undefined,
    }),
    
    // Search test actions
    setTestingIndex: assign({
      testingIndexId: ({ event }) => {
        if (event.type === 'TEST_SEARCH_INDEX') {
          return event.indexId
        }
        return undefined
      },
      testingIndex: ({ context, event }) => {
        if (event.type === 'TEST_SEARCH_INDEX') {
          return context.searchIndices.find(idx => idx.id === event.indexId)
        }
        return undefined
      },
      testQuery: '',
      testResults: [],
      isSearching: false,
    }),
    updateTestQuery: assign({
      testQuery: ({ event }) => {
        if (event.type === 'UPDATE_TEST_QUERY') {
          return event.query
        }
        return ''
      },
    }),
    executeTestSearch: ({ context }) => {
      if (context.testingIndexId && context.testQuery) {
        trpc.bus.send.mutate({
          systemId: id,
          type: 'SEARCH_IN_INDEX',
          indexId: context.testingIndexId,
          query: context.testQuery,
          limit: 10,
        })
      }
    },
    setSearching: assign({
      isSearching: true,
    }),
    setSearchResults: assign({
      testResults: ({ event }) => {
        if (event.type === 'SEARCH_RESULTS') {
          return event.data.results
        }
        return []
      },
      isSearching: false,
    }),
    clearTestSearch: assign({
      testingIndexId: undefined,
      testingIndex: undefined,
      testQuery: '',
      testResults: [],
      isSearching: false,
    }),
    // ? think we're sending duplicate documents data on startup
    setStartupData: assign({
      documents: ({ event }) => {
        if (event.type === 'LIBRARY_STARTUP') {
          const documents = event.data.documents
          // Sync tags to localStorage for backward compatibility
          tagStorage.updateTagsFromDocuments(documents)
          return documents
        }
        return []
      },
      collections: ({ event }) => {
        if (event.type === 'LIBRARY_STARTUP') {
          return event.data.collections
        }
        return []
      },
      settings: ({ event }) => {
        if (event.type === 'LIBRARY_STARTUP') {
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
    
    // Settings
    settings: undefined,
  },
  on: {
    PLUGIN_ACTIVATED: {
      actions: ['requestFolderContents', 'requestCollections'],
    },
    LIBRARY_STARTUP: {
      actions: ['setStartupData'],
    },
    
    // New file browser events
    FOLDER_CONTENTS_LOADED: {
      actions: ['setFolderContents', 'clearSelection', 'requestSearchIndices'],
    },
    NAVIGATION_CHANGED: {
      actions: 'updateNavigation',
    },
    NAVIGATE_TO_FOLDER: {
      actions: ['navigateToFolder', 'clearSelection', assign({
        currentFolderId: ({ event }) => event.folderId
      })],
    },
    BREADCRUMB_CLICK: {
      actions: ['navigateToFolder', 'clearSelection', assign({
        currentFolderId: ({ event }) => event.folderId
      })],
    },
    DOUBLE_CLICK_ITEM: {
      actions: ['handleDoubleClick', 'clearSelection'],
    },
    SELECT_ITEMS: {
      actions: 'selectItems',
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
    REORDER_ITEMS: {
      actions: 'reorderItems',
    },
    CLEAR_ITEM_TO_EDIT: {
      actions: assign({
        itemToEdit: null
      })
    },
    
    // Creation success events - refresh current folder
    DOCUMENT_CREATED: {
      actions: 'requestFolderContents',
    },
    DOCUMENT_UPDATED: {
      actions: ['requestFolderContents', 'updateEditingDocument'],
    },
    COLLECTION_CREATED: {
      actions: [
        'requestFolderContents',
        'requestCollections',
        assign({
          itemToEdit: ({ event }) => {
            // Set the new folder to be edited
            const createdEvent = event as OutgoingLibraryEvents & { type: 'COLLECTION_CREATED'; data: { collection: CollectionDTO } }
            return createdEvent.data?.collection?.id || null
          }
        })
      ],
    },
    ITEM_RENAMED: {
      actions: 'requestFolderContents',
    },
    ITEMS_DELETED: {
      actions: ['requestFolderContents', 'requestCollections'],
    },
    ITEMS_MOVED: {
      actions: ['requestFolderContents', 'requestCollections'],
    },
    ITEMS_REORDERED: {
      actions: 'requestFolderContents',
    },
    
    // Legacy events for backward compatibility
    DOCUMENTS_LOADED: {
      actions: 'setDocuments',
    },
    COLLECTIONS_LOADED: {
      actions: 'setCollections',
    },
    
    // Search index events
    SEARCH_INDICES_LOADED: {
      actions: 'setSearchIndices',
    },
    SEARCH_INDEX_CREATED: {
      actions: 'requestSearchIndices',
    },
    SEARCH_INDEX_UPDATED: {
      actions: 'requestSearchIndices',
    },
    SEARCH_INDEX_DELETED: {
      actions: 'requestSearchIndices',
    },
    SEARCH_RESULTS: {
      actions: 'setSearchResults',
    },
    ...TRAIL_CLICK([
      ['.browser', 'browser'],
      ['.create', 'create'],
      ['.edit', 'edit'],
      ['.createIndex', 'createIndex'],
      ['.editIndex', 'editIndex'],
      ['.testIndex', 'testIndex'],
    ]),
  },
  states: {
    browser: {
      entry: assign({ currentView: 'browser' }),
      meta: breadcrumb('browser', 'Library', true),
      on: {
        CREATE_DOCUMENT: 'create',
        EDIT_DOCUMENT: {
          target: 'edit',
          actions: ['setEditingDocument', 'clearSelection'],
        },
        CREATE_SEARCH_INDEX: 'createIndex',
        EDIT_SEARCH_INDEX: {
          target: 'editIndex',
          actions: 'setEditingIndex',
        },
        TEST_SEARCH_INDEX: {
          target: 'testIndex',
          actions: 'setTestingIndex',
        },
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
      meta: breadcrumbWithParams<LibraryContext>({
        target: 'edit',
        getLabel: (ctx) => `${ctx.editingDocument?.name || 'Document'}`,
      }),
      on: {
        SAVE_DOCUMENT: {
          target: 'browser',
          actions: ['updateDocument', 'clearEditingDocument'],
        },
        CANCEL_EDIT: {
          target: 'browser',
          actions: 'clearEditingDocument',
        },
      },
    },
    createIndex: {
      entry: assign({ currentView: 'create-index' }),
      meta: breadcrumb('createIndex', 'Create Search Index'),
      on: {
        SAVE_SEARCH_INDEX: {
          target: 'browser',
          actions: 'saveSearchIndex',
        },
        CANCEL_CREATE_INDEX: 'browser',
      },
    },
    editIndex: {
      entry: assign({ currentView: 'edit-index' }),
      meta: breadcrumbWithParams<LibraryContext>({
        target: 'editIndex',
        getLabel: (ctx) => `${ctx.editingIndex?.name || 'Index'}`,
      }),
      on: {
        UPDATE_SEARCH_INDEX: {
          target: 'browser',
          actions: ['updateSearchIndex', 'clearEditingIndex'],
        },
        CANCEL_EDIT_INDEX: {
          target: 'browser',
          actions: 'clearEditingIndex',
        },
      },
    },
    testIndex: {
      entry: assign({ currentView: 'test-index' }),
      meta: breadcrumbWithParams<LibraryContext>({
        target: 'testIndex',
        getLabel: (ctx) => `${ctx.testingIndex?.name || 'Index'}`,
      }),
      on: {
        UPDATE_TEST_QUERY: {
          actions: 'updateTestQuery',
        },
        EXECUTE_TEST_SEARCH: {
          actions: ['setSearching', 'executeTestSearch'],
        },
        CANCEL_TEST_SEARCH: {
          target: 'browser',
          actions: 'clearTestSearch',
        },
      },
    },
  },
})