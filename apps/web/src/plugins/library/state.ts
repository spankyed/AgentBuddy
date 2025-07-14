import { setup, assign, type ActorRefFrom } from 'xstate'
import type { DocumentDTO, CollectionDTO, OutgoingLibraryEvents } from '@abuddy/api'
import { trpc } from '@/core/trpc'

export const id = 'library' as const
export type LibraryState = ActorRefFrom<typeof libraryMachine>

export interface LibraryContext {
  documents: DocumentDTO[]
  collections: CollectionDTO[]
  selectedDocumentId?: string
  selectedCollectionId?: string
  currentView: 'list' | 'create' | 'edit' | 'collections'
  editingDocument?: DocumentDTO
  searchQuery: string
  selectedTags: string[]
}

export type LibraryEvents =
  | { type: 'PLUGIN_ACTIVATED' }
  | { type: 'TRAIL_CLICK'; trail: string[] }
  | { type: 'CREATE_DOCUMENT' }
  | { type: 'EDIT_DOCUMENT'; documentId: string }
  | { type: 'DELETE_DOCUMENT'; documentId: string }
  | { type: 'SAVE_DOCUMENT'; name: string; content: string; tags: string[]; collectionId?: string }
  | { type: 'CANCEL_EDIT' }
  | { type: 'VIEW_COLLECTIONS' }
  | { type: 'CREATE_COLLECTION'; name: string; description?: string; parentId?: string }
  | { type: 'UPDATE_COLLECTION'; id: string; name: string; description?: string }
  | { type: 'DELETE_COLLECTION'; id: string }
  | { type: 'MOVE_DOCUMENT'; documentId: string; collectionId?: string }
  | { type: 'SEARCH_DOCUMENTS'; query: string }
  | { type: 'FILTER_BY_TAG'; tag: string }
  | { type: 'CLEAR_FILTERS' }
  | { type: 'SELECT_COLLECTION'; collectionId?: string }
  | OutgoingLibraryEvents

export const libraryMachine = setup({
  types: {
    context: {} as LibraryContext,
    events: {} as LibraryEvents,
  },
  actions: {
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
    createDocument: ({ event }) => {
      if (event.type === 'SAVE_DOCUMENT') {
        trpc.bus.send.mutate({
          systemId: id,
          type: 'CREATE_DOCUMENT',
          name: event.name,
          content: event.content,
          tags: event.tags,
          collectionId: event.collectionId,
        })
      }
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
    deleteDocument: ({ event }) => {
      if (event.type === 'DELETE_DOCUMENT') {
        trpc.bus.send.mutate({
          systemId: id,
          type: 'DELETE_DOCUMENT',
          id: event.documentId,
        })
      }
    },
    createCollection: ({ event }) => {
      if (event.type === 'CREATE_COLLECTION') {
        trpc.bus.send.mutate({
          systemId: id,
          type: 'CREATE_COLLECTION',
          name: event.name,
          description: event.description,
          parentId: event.parentId,
        })
      }
    },
    updateCollection: ({ event }) => {
      if (event.type === 'UPDATE_COLLECTION') {
        trpc.bus.send.mutate({
          systemId: id,
          type: 'UPDATE_COLLECTION',
          id: event.id,
          name: event.name,
          description: event.description,
        })
      }
    },
    deleteCollection: ({ event }) => {
      if (event.type === 'DELETE_COLLECTION') {
        trpc.bus.send.mutate({
          systemId: id,
          type: 'DELETE_COLLECTION',
          id: event.id,
        })
      }
    },
    moveDocument: ({ event }) => {
      if (event.type === 'MOVE_DOCUMENT') {
        trpc.bus.send.mutate({
          systemId: id,
          type: 'MOVE_DOCUMENT',
          documentId: event.documentId,
          collectionId: event.collectionId,
        })
      }
    },
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
    addDocument: assign({
      documents: ({ context, event }) => {
        if (event.type === 'DOCUMENT_CREATED') {
          return [...context.documents, event.data.document]
        }
        return context.documents
      },
    }),
    updateDocumentInList: assign({
      documents: ({ context, event }) => {
        if (event.type === 'DOCUMENT_UPDATED') {
          return context.documents.map((doc) =>
            doc.id === event.data.document.id ? event.data.document : doc
          )
        }
        return context.documents
      },
    }),
    removeDocument: assign({
      documents: ({ context, event }) => {
        if (event.type === 'DOCUMENT_DELETED') {
          return context.documents.filter((doc) => doc.id !== event.data.documentId)
        }
        return context.documents
      },
    }),
    setEditingDocument: assign({
      editingDocument: ({ context, event }) => {
        if (event.type === 'EDIT_DOCUMENT') {
          return context.documents.find((doc) => doc.id === event.documentId)
        }
        return undefined
      },
    }),
    clearEditingDocument: assign({
      editingDocument: undefined,
    }),
    setSearchQuery: assign({
      searchQuery: ({ event }) => {
        if (event.type === 'SEARCH_DOCUMENTS') {
          return event.query
        }
        return ''
      },
    }),
    toggleTag: assign({
      selectedTags: ({ context, event }) => {
        if (event.type === 'FILTER_BY_TAG') {
          const tag = event.tag
          if (context.selectedTags.includes(tag)) {
            return context.selectedTags.filter((t) => t !== tag)
          }
          return [...context.selectedTags, tag]
        }
        return context.selectedTags
      },
    }),
    clearFilters: assign({
      searchQuery: '',
      selectedTags: [],
    }),
    selectCollection: assign({
      selectedCollectionId: ({ event }) => {
        if (event.type === 'SELECT_COLLECTION') {
          return event.collectionId
        }
        return undefined
      },
    }),
  },
}).createMachine({
  id: 'library',
  initial: 'idle',
  context: {
    documents: [],
    collections: [],
    currentView: 'list',
    searchQuery: '',
    selectedTags: [],
  },
  on: {
    PLUGIN_ACTIVATED: {
      actions: ['requestDocuments', 'requestCollections'],
    },
    DOCUMENTS_LOADED: {
      actions: 'setDocuments',
    },
    COLLECTIONS_LOADED: {
      actions: 'setCollections',
    },
    DOCUMENT_CREATED: {
      actions: 'addDocument',
    },
    DOCUMENT_UPDATED: {
      actions: 'updateDocumentInList',
    },
    DOCUMENT_DELETED: {
      actions: 'removeDocument',
    },
    SEARCH_DOCUMENTS: {
      actions: 'setSearchQuery',
    },
    FILTER_BY_TAG: {
      actions: 'toggleTag',
    },
    CLEAR_FILTERS: {
      actions: 'clearFilters',
    },
    SELECT_COLLECTION: {
      actions: ['selectCollection', 'requestDocuments'],
    },
  },
  states: {
    idle: {
      on: {
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
            guard: ({ event }) => event.trail.includes('Collections'),
            target: 'collections',
          },
          {
            target: 'list',
          },
        ],
      },
    },
    list: {
      entry: assign({ currentView: 'list' }),
      meta: {
        breadcrumb: 'Documents',
      },
      on: {
        CREATE_DOCUMENT: 'create',
        EDIT_DOCUMENT: {
          target: 'edit',
          actions: 'setEditingDocument',
        },
        DELETE_DOCUMENT: {
          actions: 'deleteDocument',
        },
        VIEW_COLLECTIONS: 'collections',
        MOVE_DOCUMENT: {
          actions: 'moveDocument',
        },
      },
    },
    create: {
      entry: assign({ currentView: 'create' }),
      meta: {
        breadcrumb: 'New Document',
      },
      on: {
        SAVE_DOCUMENT: {
          target: 'list',
          actions: 'createDocument',
        },
        CANCEL_EDIT: 'list',
      },
    },
    edit: {
      entry: assign({ currentView: 'edit' }),
      meta: {
        breadcrumb: 'Edit Document',
      },
      on: {
        SAVE_DOCUMENT: {
          target: 'list',
          actions: ['updateDocument', 'clearEditingDocument'],
        },
        CANCEL_EDIT: {
          target: 'list',
          actions: 'clearEditingDocument',
        },
      },
    },
    collections: {
      entry: assign({ currentView: 'collections' }),
      meta: {
        breadcrumb: 'Collections',
      },
      on: {
        CREATE_COLLECTION: {
          actions: 'createCollection',
        },
        UPDATE_COLLECTION: {
          actions: 'updateCollection',
        },
        DELETE_COLLECTION: {
          actions: 'deleteCollection',
        },
        TRAIL_CLICK: [
          {
            guard: ({ event }) => event.trail.includes('Documents'),
            target: 'list',
          },
        ],
      },
    },
  },
})