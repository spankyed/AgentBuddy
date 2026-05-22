import * as path from 'path'
import { qx } from '@/core/ears/helpers/query'
import { tx } from '@/core/ears/helpers/transaction'
import { edgeStore } from '@/core/ears/helpers/edge-store'
import { EARS } from '@/core/types'
import { createLogger } from '@/core/shared/debug/logger'
import type { DocumentDTO, CollectionDTO, LibraryItem, DocumentShortCode, ContentSection, FolderItem } from '../types'
// TODO: [SEARCH_INDEX_FF] import * as searchIndexRepo from '../search-index/repository'
import { libraryQueries } from './queries'
import {
  findParentCollection,
  findDocumentCollection,
  getDisplayOrder,
  getNextDisplayOrder,
  // createTagsForEntity, // Removed - tags are now stored as arrays
  // removeAllTagsFromEntity, // Removed - tags are now in settings
  getCollectionPath,
  formatFileSize,
  getContentLength,
} from './helpers'

const logger = createLogger('library')

export const libraryCommands = {
  createDocument(
    name: string,
    content: ContentSection[],
    tags: string[],
    collectionId?: EARS.EntityId,
    id?: string,
    sourceHash?: string,
  ): DocumentDTO {
    const now = Date.now()

    // Generate shortcode
    const documentCount = qx(EARS.Entity.Document).count() + 1
    const shortCode = `DOC-${documentCount}` as DocumentShortCode

    // Get display order
    const displayOrder = getNextDisplayOrder(collectionId || null)

    // Create document entity
    const builder = id ? tx(id as EARS.EntityId, true) : tx(EARS.Entity.Document)
    const documentId = builder.id()

    builder.updateBatch({
      name,
      content,
      shortCode,
      displayOrder,
      tags, // Store tags directly as string array
      ...(sourceHash && { sourceHash }),
      createdAt: now,
      updatedAt: now,
    })

    if (collectionId) {
      tx(collectionId).link(EARS.RelKind.CONTAINS, documentId)
    }

    const document = libraryQueries.getDocument(documentId)

    // [SEARCH_INDEX_FF] Auto-index in search indices (fire and forget)
    // searchIndexRepo.autoIndexNewDocument(documentId).catch(error => {
    //   logger.error('Failed to auto-index new document', {
    //     documentId,
    //     error: error instanceof Error ? error.message : String(error)
    //   })
    // })

    return document!
  },

  updateDocument(
    id: EARS.EntityId,
    name: string,
    content: ContentSection[],
    tags: string[],
    collectionId?: EARS.EntityId,
    sourceHash?: string,
  ): DocumentDTO {
    const documentId = id
    const now = Date.now()

    tx(documentId).updateBatch({
      name,
      content,
      ...(sourceHash && { sourceHash }),
      updatedAt: now,
    })
      
    // Tags are now stored as string array on documents
    tx(documentId).updateBatch({ tags })

    // Find collections that contain this document
    const allCollections = qx(EARS.Entity.Collection).pickAll()
    const collections = []
    for (const col of allCollections) {
      const docs = qx(col.id as EARS.EntityId)
        .linksTo(EARS.RelKind.CONTAINS, EARS.Entity.Document)
        .ids()
      if (docs.includes(documentId as EARS.EntityId)) {
        collections.push(col)
      }
    }
    const currentCollection = collections[0]

    // Only handle collection changes if a collectionId is explicitly provided
    if (collectionId !== undefined) {
      if (currentCollection && currentCollection.id !== collectionId) {
        edgeStore.unlink({
          sourceEntity: currentCollection.id as EARS.EntityId,
          relationType: EARS.RelKind.CONTAINS,
          targetEntity: documentId
        })
      }
      
      if (collectionId) {
        tx(collectionId).safeLink(EARS.RelKind.CONTAINS, documentId)
      }
    }
    // If collectionId is undefined, we keep the document in its current collection

    const document = libraryQueries.getDocument(documentId)

    // [SEARCH_INDEX_FF] Re-index in search indices (fire and forget)
    // searchIndexRepo.autoIndexNewDocument(documentId).catch(error => {
    //   logger.error('Failed to re-index updated document', {
    //     documentId,
    //     error: error instanceof Error ? error.message : String(error)
    //   })
    // })

    return document!
  },

  deleteDocument(id: EARS.EntityId): void {
    const documentId = id

    // Tags are now stored as string array on documents - no need to remove entity tags

    const collection = qx(EARS.Entity.Collection).pickAll().find(col => 
      qx(col.id as EARS.EntityId).linksTo(EARS.RelKind.CONTAINS, EARS.Entity.Document).ids().includes(documentId as EARS.EntityId)
    )

    if (collection) {
      edgeStore.unlink({
        sourceEntity: collection.id as EARS.EntityId,
        relationType: EARS.RelKind.CONTAINS,
        targetEntity: documentId
      })
    }

    // [SEARCH_INDEX_FF] Remove from all search indices (fire and forget)
    // searchIndexRepo.removeDocumentFromAllIndices(documentId)

    tx(documentId).destroy()
  },

  createCollection(
    name: string,
    description?: string,
    parentId?: EARS.EntityId,
    id?: string,
    sourceHash?: string,
  ): CollectionDTO {
    // Create collection entity
    const builder = id ? tx(id as EARS.EntityId, true) : tx(EARS.Entity.Collection)
    const collectionId = builder.id()
    const now = Date.now()
    
    // Get display order
    const displayOrder = getNextDisplayOrder(parentId || null)

    const attrs: Record<string, any> = {
      name,
      displayOrder,
      ...(sourceHash && { sourceHash }),
      createdAt: now,
      updatedAt: now,
    }

    if (description) {
      attrs.description = description
    }

    builder.updateBatch(attrs)
    if (parentId) {
      tx(parentId).link(EARS.RelKind.PARENT_OF, collectionId)
    }

    const path = getCollectionPath(collectionId)

    return {
      id: collectionId,
      name,
      description,
      parentId,
      path,
      documentCount: 0,
      childCollections: [],
      displayOrder,
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
    }
  },

  updateCollection(
    id: EARS.EntityId,
    name: string,
    description?: string,
    sourceHash?: string,
  ): CollectionDTO {
    const collectionId = id
    const now = Date.now()

    const attrs: Record<string, any> = {
      name,
      ...(sourceHash && { sourceHash }),
      updatedAt: now,
    }

    if (description !== undefined) {
      attrs.description = description
    }

    tx(collectionId).updateBatch(attrs)
    const collections = qx(collectionId).pickAll()
    const collection = collections[0]
    const documentCount = (qx(collectionId)
      .linksTo(EARS.RelKind.CONTAINS, EARS.Entity.Document)
      .pickAll()).length

    const childCollections = qx(collectionId)
      .linksTo(EARS.RelKind.PARENT_OF, EARS.Entity.Collection)
      .pick(['name', 'description', 'createdAt', 'updatedAt'])

    const path = getCollectionPath(collectionId)

    const buildChildren = (children: any[]): CollectionDTO[] =>
      children.map(child => ({
        id: child.id,
        name: child.name as string,
        description: child.description as string | undefined,
        path: getCollectionPath(child.id as EARS.EntityId),
        documentCount: qx(child.id as EARS.EntityId).linksTo(EARS.RelKind.CONTAINS, EARS.Entity.Document).pickAll().length,
        childCollections: buildChildren(qx(child.id as EARS.EntityId).linksTo(EARS.RelKind.PARENT_OF, EARS.Entity.Collection).pick(['name', 'description', 'createdAt', 'updatedAt'])),
        displayOrder: getDisplayOrder(child),
        createdAt: new Date(child.createdAt as number).toISOString(),
        updatedAt: new Date(child.updatedAt as number || child.createdAt as number).toISOString(),
      }))

    return {
      id: collectionId,
      name: collection!.name as string,
      description: collection!.description as string | undefined,
      path,
      documentCount,
      childCollections: buildChildren(childCollections),
      displayOrder: getDisplayOrder(collection!),
      createdAt: new Date(collection!.createdAt as number).toISOString(),
      updatedAt: new Date(collection!.updatedAt as number || collection!.createdAt as number).toISOString(),
    }
  },

  deleteCollection(id: EARS.EntityId): void {
    const collectionId = id

    const documents = qx(collectionId)
      .linksTo(EARS.RelKind.CONTAINS, EARS.Entity.Document)
      .pickAll()

    for (const doc of documents) {
      edgeStore.unlink({
        sourceEntity: collectionId,
        relationType: EARS.RelKind.CONTAINS,
        targetEntity: doc.id as EARS.EntityId
      })
    }

    const parent = findParentCollection(collectionId) ? qx(findParentCollection(collectionId)!).pickAll()[0] : null

    if (parent) {
      edgeStore.unlink({
        sourceEntity: parent.id as EARS.EntityId,
        relationType: EARS.RelKind.PARENT_OF,
        targetEntity: collectionId
      })
    }

    const children = qx(collectionId)
      .linksTo(EARS.RelKind.PARENT_OF, EARS.Entity.Collection)
      .pickAll()

    for (const child of children) {
      edgeStore.unlink({
        sourceEntity: collectionId,
        relationType: EARS.RelKind.PARENT_OF,
        targetEntity: child.id as EARS.EntityId
      })
      if (parent) {
        tx(parent.id as EARS.EntityId).link(EARS.RelKind.PARENT_OF, child.id as EARS.EntityId)
      }
    }

    // [SEARCH_INDEX_FF] Delete all search indices associated with this folder (fire and forget)
    // searchIndexRepo.deleteSearchIndicesForFolder(collectionId)

    tx(collectionId).destroy()
  },

  moveDocument(
    documentId: EARS.EntityId,
    newCollectionId?: EARS.EntityId
  ): DocumentDTO {
    const docId = documentId

    const currentCollection = qx(EARS.Entity.Collection).pickAll().find(col => 
      qx(col.id as EARS.EntityId).linksTo(EARS.RelKind.CONTAINS, EARS.Entity.Document).ids().includes(docId)
    )

    if (currentCollection) {
      edgeStore.unlink({
        sourceEntity: currentCollection.id as EARS.EntityId,
        relationType: EARS.RelKind.CONTAINS,
        targetEntity: docId
      })
    }

    if (newCollectionId) {
      tx(newCollectionId).link(EARS.RelKind.CONTAINS, docId)
    }

    const document = libraryQueries.getDocument(docId)
    return document!
  },

  renameItem(id: EARS.EntityId, name: string, type: 'document' | 'folder'): LibraryItem {
    const entityId = id
    const now = Date.now()
    
    tx(entityId).updateBatch({
      name,
      updatedAt: now,
    })
    
    if (type === 'document') {
      const doc = libraryQueries.getDocument(entityId)
      if (!doc) {
        throw new Error(`Document ${entityId} not found`)
      }
      // Ensure content is an array
      const content = doc.content || []
      return {
        type: 'document',
        id: entityId,
        name,
        shortCode: doc.shortCode,
        parentId: doc.collectionId || null,
        content: content,
        tags: doc.tags,
        size: formatFileSize(getContentLength(content)),
        kind: 'Document',
        displayOrder: getDisplayOrder(doc),
        createdAt: doc.createdAt,
        updatedAt: new Date(now).toISOString(),
      }
    } else {
      const collections = qx(entityId).pickAll()
      const collection = collections[0]!
      const childCount = 0 // Simplified for now
      
      // Find parent folder
      const parentId = findParentCollection(entityId)
      
      return {
        type: 'folder',
        id: entityId,
        name,
        parentId,
        childCount,
        size: `${childCount} items`,
        kind: 'Folder',
        displayOrder: getDisplayOrder(collection),
        createdAt: new Date(collection.createdAt as number).toISOString(),
        updatedAt: new Date(now).toISOString(),
      }
    }
  },

  deleteItems(ids: EARS.EntityId[]): void {
    for (const id of ids) {
      // Check entity type from ID prefix
      if (id.startsWith('Document-')) {
        this.deleteDocument(id as EARS.EntityId)
      } else if (id.startsWith('Collection-')) {
        this.deleteCollection(id)
      }
    }
  },

  moveItems(ids: EARS.EntityId[], targetFolderId: EARS.EntityId | null): void {
    for (const id of ids) {
      if (id.startsWith('Document-')) {
        this.moveDocument(id, targetFolderId || undefined)
      } else if (id.startsWith('Collection-')) {
        // Move collection to new parent
        const collectionId = id
        
        const currentParent = findParentCollection(collectionId)
        
        // Remove from current parent if exists
        if (currentParent) {
          edgeStore.unlink({
            sourceEntity: currentParent,
            relationType: EARS.RelKind.PARENT_OF,
            targetEntity: collectionId
          })
        }
        
        // Add to new parent if specified
        if (targetFolderId) {
          tx(targetFolderId).link(EARS.RelKind.PARENT_OF, collectionId)
        }
        
        // Update display order
        const displayOrder = getNextDisplayOrder(targetFolderId)
        tx(collectionId).update('displayOrder', displayOrder)
      }
    }
  },

  // ! todo remove - Migration: ensures all documents have shortcodes
  migrateDocumentShortCodes(): void {
    const allDocuments = qx(EARS.Entity.Document).pickAll()
    allDocuments.forEach((doc, i) => {
      if (!doc.shortCode) tx(doc.id as EARS.EntityId).put('shortCode', `DOC-${i + 1}` as DocumentShortCode)
    })
  },

  // ! todo remove - Migration: fixes display order arrays and ensures all items have display orders
  migrateDisplayOrders(): void {
    let order = 1000
    qx(EARS.Entity.Document).pickAll().forEach(doc => {
      const d = doc.displayOrder
      if (Array.isArray(d) || !d) {
        tx(doc.id as EARS.EntityId).update('displayOrder', Array.isArray(d) ? (d[0] || order) : order)
        order += 1000
      }
    })
    order = 1000
    qx(EARS.Entity.Collection).pickAll().forEach(col => {
      const d = col.displayOrder
      if (Array.isArray(d) || !d) {
        tx(col.id as EARS.EntityId).update('displayOrder', Array.isArray(d) ? (d[0] || order) : order)
        order += 1000
      }
    })
  },

  createSymlinkCollection(
    name: string,
    symlinkPath: string,
    parentId?: EARS.EntityId,
    id?: string,
  ): CollectionDTO {
    const builder = id ? tx(id as EARS.EntityId, true) : tx(EARS.Entity.Collection)
    const collectionId = builder.id()
    const now = Date.now()

    const displayOrder = getNextDisplayOrder(parentId || null)

    builder.updateBatch({
      name,
      symlinkPath,
      displayOrder,
      createdAt: now,
      updatedAt: now,
    })

    if (parentId) {
      tx(parentId).link(EARS.RelKind.PARENT_OF, collectionId)
    }

    const path = getCollectionPath(collectionId)

    return {
      id: collectionId,
      name,
      parentId,
      path,
      documentCount: 0,
      childCollections: [],
      displayOrder,
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
      symlinkPath,
    }
  },

  updateSymlinkPath(collectionId: EARS.EntityId, newPath: string): CollectionDTO {
    const now = Date.now()
    const newName = path.basename(newPath) || 'Symlink'
    tx(collectionId).update('symlinkPath', newPath)
    tx(collectionId).update('name', newName)
    tx(collectionId).update('updatedAt', now)

    const col = qx(collectionId).pickAll()[0]
    const colPath = getCollectionPath(collectionId)
    const parentId = findParentCollection(collectionId) || undefined

    return {
      id: collectionId,
      name: newName,
      parentId,
      path: colPath,
      documentCount: 0,
      childCollections: [],
      displayOrder: (col.displayOrder as number) || 0,
      createdAt: new Date(col.createdAt as number).toISOString(),
      updatedAt: new Date(now).toISOString(),
      symlinkPath: newPath,
    }
  },

  updateDocumentTags(documentId: EARS.EntityId, tags: string[]): void {
    tx(documentId).update('tags', tags)
    // tx(documentId).update('updatedAt', Date.now())
  }
} as const