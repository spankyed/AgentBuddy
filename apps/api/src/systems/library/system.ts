import { assign, setup, sendTo } from 'xstate'
import { z } from 'zod'
import { systemBus, fromSystem } from '@/core/utils/event-helpers'
import type { EARS } from '@/core/types'
import type { LibrarySystemContext, DocumentDTO, CollectionDTO } from './types'
import { emit, safeEvents } from '@/core/utils/actor-helpers'
import { bus } from '@/systems/backend'
import * as repository from './repository'
import type { MergeReceivable } from '@/core/utils/event-helpers'

export const library = 'library' as const

const busEvent = systemBus(library)

const IncomingLibraryEvents = [
  busEvent('LIST_DOCUMENTS', {
    collectionId: z.string().optional(),
  }),
  busEvent('CREATE_DOCUMENT', {
    name: z.string(),
    content: z.string(),
    tags: z.array(z.string()),
    collectionId: z.string().optional(),
  }),
  busEvent('UPDATE_DOCUMENT', {
    id: z.string(),
    name: z.string(),
    content: z.string(),
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
] as const

export type OutgoingLibraryEvents =
  | { type: 'LIBRARY_STARTUP'; data: { documents: DocumentDTO[]; collections: CollectionDTO[] } }
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

// Removed OutgoingSystemEvents helper - using direct event structure instead

export const LibrarySystemEvents = fromSystem(IncomingLibraryEvents)<OutgoingLibraryEvents, typeof library>()
type LibraryInternalEvents = { type: 'CLIENT_CONNECTED' }
type ReceivableEvents = MergeReceivable<typeof IncomingLibraryEvents, LibraryInternalEvents>
const typeOf = safeEvents<ReceivableEvents>()

export const libraryMachine = setup({
  types: {
    context: {} as LibrarySystemContext,
    events: {} as ReceivableEvents,
    input: {} as EARS.EntityId,
  },
  actions: {
    loadDocuments: async ({ system, event }) => {
      const ev = typeOf('LIST_DOCUMENTS', event)
      const documents = await repository.getDocuments(ev.collectionId)
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
      const ev = typeOf('CREATE_DOCUMENT', event)
      const document = await repository.createDocument(
        ev.name,
        ev.content,
        ev.tags,
        ev.collectionId
      )
      system.get(bus).send({
        type: 'OUTGOING' as const,
        event: {
          type: 'DOCUMENT_CREATED' as const,
          pluginId: 'library',
          data: { document },
        },
      })
    },
    updateDocument: async ({ system, event }) => {
      const ev = typeOf('UPDATE_DOCUMENT', event)
      const document = await repository.updateDocument(
        ev.id,
        ev.name,
        ev.content,
        ev.tags,
        ev.collectionId
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
    deleteDocument: async ({ system, event }) => {
      const ev = typeOf('DELETE_DOCUMENT', event)
      await repository.deleteDocument(ev.id)
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
      const ev = typeOf('GET_DOCUMENT', event)
      const document = await repository.getDocument(ev.id)
      if (document) {
        system.get(bus).send({
          type: 'OUTGOING' as const,
          event: {
            type: 'DOCUMENT_LOADED' as const,
            pluginId: 'library',
            data: { document },
          },
        })
      } else {
        system.get(bus).send({
          type: 'OUTGOING' as const,
          event: {
            type: 'LIBRARY_ERROR' as const,
            pluginId: 'library',
            data: { error: 'Document not found' },
          },
        })
      }
    },
    loadCollections: async ({ system, event }) => {
      const ev = typeOf('LIST_COLLECTIONS', event)
      const collections = await repository.getCollections()
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
      const ev = typeOf('CREATE_COLLECTION', event)
      const collection = await repository.createCollection(
        ev.name,
        ev.description,
        ev.parentId
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
    updateCollection: async ({ system, event }) => {
      const ev = typeOf('UPDATE_COLLECTION', event)
      const collection = await repository.updateCollection(
        ev.id,
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
      const ev = typeOf('DELETE_COLLECTION', event)
      await repository.deleteCollection(ev.id)
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
      const ev = typeOf('MOVE_DOCUMENT', event)
      const document = await repository.moveDocument(
        ev.documentId,
        ev.collectionId
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
      const [documents, collections] = await Promise.all([
        repository.getDocuments(),
        repository.getCollections(),
      ])
      system.get(bus).send({
        type: 'OUTGOING' as const,
        event: {
          type: 'LIBRARY_STARTUP' as const,
          pluginId: 'library',
          data: { documents, collections },
        },
      })
    },
  },
}).createMachine({
  id: library,
  initial: 'idle',
  context: ({ input }) => ({
    documents: [],
    collections: [],
  }),
  on: {
    CLIENT_CONNECTED: {
      actions: ['sendInitialData'],
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
      },
    },
  },
})