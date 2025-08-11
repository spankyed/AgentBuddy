import { qx } from '@/core/utils/ears/helpers/query'
import { EARS } from '@/core/types'
import type { DocumentDTO, CollectionDTO, LibraryItem, FolderItem, DocumentItem, FolderContents, BreadcrumbItem, DocumentShortCode, ContentSection } from '../types'
import { 
  findParentCollection,
  isRootCollection,
  findDocumentCollection,
  getDisplayOrder,
  getCollectionPath,
  formatFileSize,
  getContentLength
} from './helpers'

export const libraryQueries = {
  getDocuments(collectionId?: string): DocumentDTO[] {
    let query = qx(EARS.Entity.Document)

    if (collectionId) {
      const documentsInCollection = qx(collectionId as EARS.EntityId)
        .linksTo(EARS.RelKind.CONTAINS, EARS.Entity.Document)
        .pickAll()

      const documentIds = documentsInCollection.map((doc) => doc.id)
      if (documentIds.length === 0) return []

      const documents = documentIds.map((id) => this.getDocument(id as EARS.EntityId))
      return documents.filter((doc): doc is DocumentDTO => doc !== null)
    }

    const documents = query.pick(['name', 'content', 'shortCode', 'createdAt', 'updatedAt'])

    const documentsWithDetails = documents.map((doc) => {
      const tags = qx(doc.id)
        .linksTo(EARS.RelKind.HAS, EARS.Entity.Tag)
        .pick(['name'])

      // Find collection that contains this document
      const collectionId = findDocumentCollection(doc.id as EARS.EntityId)
      const collection = collectionId ? qx(collectionId).pickAll()[0] : null

      const collectionPath = collection
        ? getCollectionPath(collection.id as EARS.EntityId)
        : []

      return {
        id: doc.id,
        name: doc.name as string,
        content: doc.content as ContentSection[],
        shortCode: doc.shortCode as DocumentShortCode,
        tags: tags.map((t) => t.name as string),
        collectionId: collection?.id,
        collectionPath,
        displayOrder: getDisplayOrder(doc),
        createdAt: new Date(doc.createdAt as number).toISOString(),
        updatedAt: new Date(doc.updatedAt as number || doc.createdAt as number).toISOString(),
      }
    })

    return documentsWithDetails
  },

  getDocument(id: EARS.EntityId): DocumentDTO | null {
    const documentId = id
    const documents = qx(documentId).pickAll()
    const document = documents[0]

    if (!document) return null

    const tags = qx(documentId as EARS.EntityId)
      .linksTo(EARS.RelKind.HAS, EARS.Entity.Tag)
      .pick(['name'])

    const collection = qx(EARS.Entity.Collection).pickAll().find(col => 
      qx(col.id as EARS.EntityId).linksTo(EARS.RelKind.CONTAINS, EARS.Entity.Document).ids().includes(documentId as EARS.EntityId)
    )

    const collectionPath = collection
      ? getCollectionPath(collection.id as EARS.EntityId)
      : []

    return {
      id: documentId,
      name: document.name as string,
      content: document.content as ContentSection[],
      shortCode: document.shortCode as DocumentShortCode,
      tags: tags.map((t) => t.name as string),
      collectionId: collection?.id,
      collectionPath,
      displayOrder: getDisplayOrder(document),
      createdAt: new Date(document.createdAt as number).toISOString(),
      updatedAt: new Date(document.updatedAt as number || document.createdAt as number).toISOString(),
    }
  },

  getDocumentByShortCode(shortCode: DocumentShortCode): DocumentDTO | null {
    const documents = qx(EARS.Entity.Document)
      .where('shortCode', shortCode)
      .pickAll()
    
    if (documents.length === 0) {
      return null
    }
    
    return this.getDocument(documents[0].id as EARS.EntityId)
  },

  getCollections(): CollectionDTO[] {
    const rootCollections = qx(EARS.Entity.Collection)
      .pick(['name', 'description', 'createdAt', 'updatedAt'])
      .filter(col => isRootCollection(col.id as EARS.EntityId))

    const buildTree = (cols: any[]): CollectionDTO[] =>
      cols.map(col => ({
        id: col.id,
        name: col.name as string,
        description: col.description as string | undefined,
        path: getCollectionPath(col.id as EARS.EntityId),
        documentCount: qx(col.id as EARS.EntityId).linksTo(EARS.RelKind.CONTAINS, EARS.Entity.Document).ids().length,
        childCollections: buildTree(qx(col.id as EARS.EntityId).linksTo(EARS.RelKind.PARENT_OF, EARS.Entity.Collection).pick(['name', 'description', 'createdAt', 'updatedAt'])),
        displayOrder: getDisplayOrder(col),
        createdAt: new Date(col.createdAt as number).toISOString(),
        updatedAt: new Date(col.updatedAt as number || col.createdAt as number).toISOString(),
      }))

    return buildTree(rootCollections)
  },

  getFolderContents(folderId: EARS.EntityId | null): FolderContents {
    const items: LibraryItem[] = []
    
    // Get folders (collections) in this directory
    let folders: any[] = []
    
    if (folderId === null) {
      // Root directory - get collections without parents
      const allCollections = qx(EARS.Entity.Collection).pickAll()
      for (const col of allCollections) {
        if (isRootCollection(col.id as EARS.EntityId)) {
          folders.push(col)
        }
      }
    } else {
      // Get child collections of this folder
      folders = qx(folderId)
        .linksTo(EARS.RelKind.PARENT_OF, EARS.Entity.Collection)
        .pick(['name', 'description', 'displayOrder', 'createdAt', 'updatedAt'])
    }
    
    // Convert collections to folder items
    for (const folder of folders) {
      const folderId = folder.id
      const childCollections = qx(folder.id as EARS.EntityId)
        .linksTo(EARS.RelKind.PARENT_OF, EARS.Entity.Collection)
        .pickAll()
      const documents = qx(folder.id as EARS.EntityId)
        .linksTo(EARS.RelKind.CONTAINS, EARS.Entity.Document)
        .pickAll()
      const childCount = childCollections.length + documents.length
      
      items.push({
        type: 'folder',
        id: folder.id,
        name: folder.name as string,
        parentId: folderId,
        childCount,
        size: childCount === 1 ? '1 item' : `${childCount} items`,
        kind: 'Folder',
        displayOrder: getDisplayOrder(folder),
        createdAt: new Date(folder.createdAt as number).toISOString(),
        updatedAt: new Date(folder.updatedAt as number || folder.createdAt as number).toISOString(),
      })
    }
    
    // Get documents in this directory
    let documents: any[] = []
    
    if (folderId === null) {
      // Root directory - get documents not in any collection
      documents = qx(EARS.Entity.Document).pickAll().filter(doc => !findDocumentCollection(doc.id as EARS.EntityId))
    } else {
      // Get documents in this collection
      documents = qx(folderId)
        .linksTo(EARS.RelKind.CONTAINS, EARS.Entity.Document)
        .pick(['name', 'content', 'shortCode', 'displayOrder', 'createdAt', 'updatedAt'])
    }
    
    // Convert documents to document items
    for (const doc of documents) {
      const documentId = doc.id
      
      const contentSections = doc.content as ContentSection[]
      
      // Calculate content length for all sections
      const contentLength = getContentLength(contentSections)
      const size = formatFileSize(contentLength)
      
      // Get tags
      const tags = qx(doc.id as EARS.EntityId)
        .linksTo(EARS.RelKind.HAS, EARS.Entity.Tag)
        .pick(['name'])
      
      items.push({
        type: 'document',
        id: documentId,
        name: doc.name as string,
        shortCode: doc.shortCode as DocumentShortCode,
        parentId: folderId,
        content: contentSections,
        tags: tags.map(tag => tag.name as string),
        size,
        kind: 'Document',
        displayOrder: getDisplayOrder(doc),
        createdAt: new Date(doc.createdAt as number).toISOString(),
        updatedAt: new Date(doc.updatedAt as number || doc.createdAt as number).toISOString(),
      })
    }
    
    // Get current path and breadcrumbs
    const currentPath = folderId ? getCollectionPath(folderId) : []
    const breadcrumbs = this.getFolderPath(folderId)
    
    return {
      items: items.sort((a, b) => {
        // Folders first, then by display order
        if (a.type !== b.type) {
          return a.type === 'folder' ? -1 : 1
        }
        // Sort by display order, fall back to name if orders are equal
        if (a.displayOrder !== b.displayOrder) {
          return a.displayOrder - b.displayOrder
        }
        return a.name.localeCompare(b.name)
      }),
      currentPath,
      currentFolderId: folderId,
      breadcrumbs,
    }
  },

  getFolderPath(folderId: EARS.EntityId | null): BreadcrumbItem[] {
    if (folderId === null) {
      return []
    }
    
    const breadcrumbs: BreadcrumbItem[] = []
    let currentId: EARS.EntityId | null = folderId
    
    // Walk up the parent chain to build breadcrumbs
    while (currentId) {
      const collections = qx(currentId).pickAll()
      const collection = collections[0]
      if (collection) {
        breadcrumbs.unshift({
          id: currentId,
          name: collection.name as string,
          path: [], // We don't need path for breadcrumbs
        })
      }
      
      // Find parent
      currentId = findParentCollection(currentId)
    }
    
    return breadcrumbs
  },

  getParentFolderId(folderId: EARS.EntityId): EARS.EntityId | null {
    return findParentCollection(folderId)
  },

  getCollectionByName(name: string): CollectionDTO | null {
    const collections = qx(EARS.Entity.Collection)
      .where('name', name)
      .pickAll()
    
    if (collections.length === 0) {
      return null
    }
    
    const collection = collections[0]
    const documentCount = qx(collection.id as EARS.EntityId)
      .linksTo(EARS.RelKind.CONTAINS, EARS.Entity.Document)
      .ids().length
    
    const childCollections = qx(collection.id as EARS.EntityId)
      .linksTo(EARS.RelKind.PARENT_OF, EARS.Entity.Collection)
      .pickAll()
    
    const path = getCollectionPath(collection.id as EARS.EntityId)
    
    return {
      id: collection.id as EARS.EntityId,
      name: collection.name as string,
      description: collection.description as string | undefined,
      path,
      documentCount,
      childCollections: childCollections as unknown as CollectionDTO[],
      displayOrder: getDisplayOrder(collection),
      createdAt: new Date(collection.createdAt as number).toISOString(),
      updatedAt: new Date(collection.updatedAt as number || collection.createdAt as number).toISOString(),
    }
  },

  getDocumentsInCollection(collectionId: EARS.EntityId): DocumentDTO[] {
    const documentIds = qx(collectionId)
      .linksTo(EARS.RelKind.CONTAINS, EARS.Entity.Document)
      .ids()
    
    if (documentIds.length === 0) {
      return []
    }
    
    const documents = documentIds.map((id) => this.getDocument(id))
    
    return documents.filter((doc): doc is DocumentDTO => doc !== null)
  }
} as const