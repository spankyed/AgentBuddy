import { setup, assign, type ActorRefFrom } from 'xstate'
import type { DocumentDTO, CollectionDTO, OutgoingLibraryEvents, LibraryItem, FolderContents, BreadcrumbItem, ContentSection, SearchIndex } from '@app/api'
import type { SearchIndexFormData } from './types/search-index'
import { trpc } from '@/core/trpc'

export const id = 'library' as const
import type { SnapshotFrom } from 'xstate'

export type LibraryState = SnapshotFrom<typeof librarySystem>

export interface LibraryContext {
  // Legacy fields for backward compatibility
  documents: DocumentDTO[]
  collections: CollectionDTO[]
  selectedDocumentId?: string
  selectedCollectionId?: string
  currentView: 'browser' | 'create' | 'edit' | 'create-index' | 'edit-index'
  editingDocument?: DocumentDTO
  searchQuery: string
  selectedTags: string[]
  
  // New file browser fields
  items: LibraryItem[]
  currentFolderId: string | null
  currentPath: string[]
  selectedItems: string[]
  sortBy: 'name' | 'modified' | 'size' | 'kind'
  sortDirection: 'asc' | 'desc'
  breadcrumbs: BreadcrumbItem[]
  editingItem?: LibraryItem
  
  // Search index fields
  searchIndices: SearchIndex[]
  editingIndexId?: string
  editingIndex?: SearchIndex
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
  
  // Legacy collection events  
  | { type: 'VIEW_COLLECTIONS' }
  | { type: 'CREATE_COLLECTION'; name: string; description?: string; parentId?: string }
  | { type: 'UPDATE_COLLECTION'; id: string; name: string; description?: string }
  | { type: 'DELETE_COLLECTION'; id: string }
  | { type: 'MOVE_DOCUMENT'; documentId: string; collectionId?: string }
  | { type: 'SEARCH_DOCUMENTS'; query: string }
  | { type: 'FILTER_BY_TAG'; tag: string }
  | { type: 'CLEAR_FILTERS' }
  | { type: 'SELECT_COLLECTION'; collectionId?: string }
  
  // New file browser events
  | { type: 'NAVIGATE_TO_FOLDER'; folderId: string | null }
  | { type: 'DOUBLE_CLICK_ITEM'; item: LibraryItem }
  | { type: 'SELECT_ITEMS'; itemIds: string[] }
  | { type: 'RENAME_ITEM'; itemId: string; name: string }
  | { type: 'DELETE_SELECTED_ITEMS' }
  | { type: 'CREATE_FOLDER'; name: string }
  | { type: 'SORT_BY'; column: 'name' | 'modified' | 'size' | 'kind' }
  | { type: 'SEARCH'; query: string }
  | { type: 'BREADCRUMB_CLICK'; folderId: string | null }
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
        // Use event.collectionId if provided (and not empty string), otherwise use context.currentFolderId
        const targetCollectionId = (event.collectionId && event.collectionId.trim() !== '') 
          ? event.collectionId 
          : (context.currentFolderId || undefined)
        
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
    renameItem: ({ event }) => {
      if (event.type === 'RENAME_ITEM') {
        // Determine if it's a document or folder based on the current items
        // This is a simplified approach - in practice you'd track the item type
        trpc.bus.send.mutate({
          systemId: id,
          type: 'RENAME_ITEM',
          id: event.itemId,
          name: event.name,
          itemType: 'document', // Default to document for now
        })
      }
    },

    // State update actions
    setFolderContents: assign({
      items: ({ event }) => {
        if (event.type === 'FOLDER_CONTENTS_LOADED') {
          return event.data.items
        }
        return []
      },
      currentFolderId: ({ event }) => {
        if (event.type === 'FOLDER_CONTENTS_LOADED') {
          return event.data.currentFolderId
        }
        return null
      },
      currentPath: ({ event }) => {
        if (event.type === 'FOLDER_CONTENTS_LOADED') {
          return event.data.currentPath
        }
        return []
      },
      breadcrumbs: ({ event }) => {
        if (event.type === 'FOLDER_CONTENTS_LOADED') {
          return event.data.breadcrumbs || []
        }
        return []
      },
    }),
    updateNavigation: assign({
      currentFolderId: ({ event }) => {
        if (event.type === 'NAVIGATION_CHANGED') {
          return event.data.folderId
        }
        return null
      },
      currentPath: ({ event }) => {
        if (event.type === 'NAVIGATION_CHANGED') {
          return event.data.path
        }
        return []
      },
    }),
    selectItems: assign({
      selectedItems: ({ event }) => {
        if (event.type === 'SELECT_ITEMS') {
          return event.itemIds
        }
        return []
      },
    }),
    setSortOrder: assign({
      sortBy: ({ event }) => {
        if (event.type === 'SORT_BY') {
          return event.column
        }
        return 'name'
      },
      sortDirection: ({ context, event }) => {
        if (event.type === 'SORT_BY') {
          // Toggle direction if same column, otherwise default to 'asc'
          return context.sortBy === event.column && context.sortDirection === 'asc' ? 'desc' : 'asc'
        }
        return 'asc'
      },
    }),
    setSearchQuery: assign({
      searchQuery: ({ event }) => {
        if (event.type === 'SEARCH') {
          return event.query
        }
        return ''
      },
    }),

    // Legacy actions for backward compatibility
    requestDocuments: ({ context }) => {
      trpc.bus.send.mutate({
        systemId: id,
        type: 'LIST_DOCUMENTS',
        collectionId: context.selectedCollectionId,
      })
    },
    requestCollections: () => {
      trpc.bus.send.mutate({
        systemId: id,
        type: 'LIST_COLLECTIONS',
      })
    },
    updateDocument: ({ context, event }) => {
      if (event.type === 'SAVE_DOCUMENT' && context.editingDocument) {
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
          return event.data.documents
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
  },
}).createMachine({
  id: 'library',
  initial: 'browser',
  context: {
    // Legacy fields
    documents: [],
    collections: [],
    currentView: 'browser',
    searchQuery: '',
    selectedTags: [],
    
    // New file browser fields
    items: [],
    currentFolderId: null,
    currentPath: [],
    selectedItems: [],
    sortBy: 'name',
    sortDirection: 'asc',
    breadcrumbs: [],
    editingItem: undefined,
    
    // Search index fields
    searchIndices: [],
    editingIndexId: undefined,
    editingIndex: undefined,
  },
  on: {
    PLUGIN_ACTIVATED: {
      actions: ['requestFolderContents', 'requestCollections'],
    },
    
    // New file browser events
    FOLDER_CONTENTS_LOADED: {
      actions: ['setFolderContents', 'requestSearchIndices'],
    },
    NAVIGATION_CHANGED: {
      actions: 'updateNavigation',
    },
    NAVIGATE_TO_FOLDER: {
      actions: ['navigateToFolder', assign({
        currentFolderId: ({ event }) => event.folderId
      })],
    },
    BREADCRUMB_CLICK: {
      actions: ['navigateToFolder', assign({
        currentFolderId: ({ event }) => event.folderId
      })],
    },
    DOUBLE_CLICK_ITEM: {
      actions: 'handleDoubleClick',
    },
    SELECT_ITEMS: {
      actions: 'selectItems',
    },
    SORT_BY: {
      actions: 'setSortOrder',
    },
    SEARCH: {
      actions: 'setSearchQuery',
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
    
    // Creation success events - refresh current folder
    DOCUMENT_CREATED: {
      actions: 'requestFolderContents',
    },
    DOCUMENT_UPDATED: {
      actions: ['requestFolderContents', 'updateEditingDocument'],
    },
    COLLECTION_CREATED: {
      actions: 'requestFolderContents',
    },
    ITEM_RENAMED: {
      actions: 'requestFolderContents',
    },
    ITEMS_DELETED: {
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
  },
  states: {
    browser: {
      entry: assign({ currentView: 'browser' }),
      meta: {
        breadcrumb: 'Library',
      },
      on: {
        CREATE_DOCUMENT: 'create',
        EDIT_DOCUMENT: {
          target: 'edit',
          actions: 'setEditingDocument',
        },
        CREATE_SEARCH_INDEX: 'createIndex',
        EDIT_SEARCH_INDEX: {
          target: 'editIndex',
          actions: 'setEditingIndex',
        },
        TRAIL_CLICK: [
          {
            guard: ({ event }) => event.trail.includes('Create'),
            target: 'create',
          },
          {
            guard: ({ event }) => event.trail.includes('Edit'),
            target: 'edit',
          },
          {
            guard: ({ event }) => event.trail.includes('Index'),
            target: 'createIndex',
          },
        ],
      },
    },
    create: {
      entry: assign({ currentView: 'create' }),
      meta: {
        breadcrumb: 'New Document',
      },
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
        breadcrumb: 'Edit Document',
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
      },
    },
    createIndex: {
      entry: assign({ currentView: 'create-index' }),
      meta: {
        breadcrumb: 'Create Search Index',
      },
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
      meta: {
        breadcrumb: 'Edit Search Index',
      },
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
  },
})