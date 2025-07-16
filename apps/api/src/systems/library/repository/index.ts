import { v4 as uuid } from 'uuid'
import { qx } from '@/core/utils/ears/helpers/query'
import { tx } from '@/core/utils/ears/helpers/transaction'
import { edgeStore } from '@/core/utils/ears/helpers/edge-store'
import { EARS } from '@/core/types'
import type { DocumentDTO, CollectionDTO, LibraryItem, FolderItem, DocumentItem, FolderContents, BreadcrumbItem, DocumentShortCode } from '../types'

export async function getDocuments(collectionId?: string): Promise<DocumentDTO[]> {
  let query = qx(EARS.Entity.Document)

  if (collectionId) {
    const documentsInCollection = await qx(collectionId as EARS.EntityId)
      .linksTo(EARS.RelKind.CONTAINS, EARS.Entity.Document)
      .pickAll()

    const documentIds = documentsInCollection.map((doc) => doc.id)
    if (documentIds.length === 0) return []

    const documents = await Promise.all(
      documentIds.map((id) => getDocument(id as EARS.EntityId))
    )
    return documents.filter((doc): doc is DocumentDTO => doc !== null)
  }

  const documents = await query.pick(['name', 'content', 'shortCode', 'createdAt', 'updatedAt'])

  const documentsWithDetails = await Promise.all(
    documents.map(async (doc) => {
      const tags = await qx(doc.id)
        .linksTo(EARS.RelKind.HAS, EARS.Entity.Tag)
        .pick(['name'])

      // Find collections that contain this document
      const allCollections = await qx(EARS.Entity.Collection).pickAll()
      const collections = []
      for (const col of allCollections) {
        const docs = await qx(col.id as EARS.EntityId)
          .linksTo(EARS.RelKind.CONTAINS, EARS.Entity.Document)
          .ids()
        if (docs.includes(doc.id as EARS.EntityId)) {
          collections.push(col)
        }
      }
      const collection = collections[0]

      const collectionPath = collection
        ? await getCollectionPath(collection.id as EARS.EntityId)
        : []

      return {
        id: doc.id,
        name: doc.name as string,
        content: doc.content as string,
        shortCode: doc.shortCode as DocumentShortCode,
        tags: tags.map((t) => t.name as string),
        collectionId: collection?.id,
        collectionPath,
        createdAt: new Date(doc.createdAt as number).toISOString(),
        updatedAt: new Date(doc.updatedAt as number || doc.createdAt as number).toISOString(),
      }
    })
  )

  return documentsWithDetails
}

export async function getDocument(id: EARS.EntityId): Promise<DocumentDTO | null> {
  const documentId = id
  const documents = await qx(documentId).pickAll()
  const document = documents[0]

  if (!document) return null

  const tags = await qx(documentId as EARS.EntityId)
    .linksTo(EARS.RelKind.HAS, EARS.Entity.Tag)
    .pick(['name'])

  // Find collections that contain this document
  const allCollections = await qx(EARS.Entity.Collection).pickAll()
  const collections = []
  for (const col of allCollections) {
    const docs = await qx(col.id as EARS.EntityId)
      .linksTo(EARS.RelKind.CONTAINS, EARS.Entity.Document)
      .ids()
    if (docs.includes(documentId as EARS.EntityId)) {
      collections.push(col)
    }
  }
  const collection = collections[0]

  const collectionPath = collection
    ? await getCollectionPath(collection.id as EARS.EntityId)
    : []

  return {
    id: documentId,
    name: document.name as string,
    content: document.content as string,
    shortCode: document.shortCode as DocumentShortCode,
    tags: tags.map((t) => t.name as string),
    collectionId: collection?.id,
    collectionPath,
    createdAt: new Date(document.createdAt as number).toISOString(),
    updatedAt: new Date(document.updatedAt as number || document.createdAt as number).toISOString(),
  }
}

export async function getDocumentByShortCode(shortCode: DocumentShortCode): Promise<DocumentDTO | null> {
  const documents = await qx(EARS.Entity.Document)
    .where('shortCode', shortCode)
    .pickAll()
  
  if (documents.length === 0) {
    return null
  }
  
  return getDocument(documents[0].id as EARS.EntityId)
}

export async function createDocument(
  name: string,
  content: string,
  tags: string[],
  collectionId?: EARS.EntityId
): Promise<DocumentDTO> {
  const documentId = `Document-${uuid()}` as EARS.EntityId
  const now = Date.now()
  
  // Generate shortcode
  const documentCount = qx(EARS.Entity.Document).count() + 1
  const shortCode = `DOC-${documentCount}` as DocumentShortCode

  tx(documentId).batchPut({
    name,
    content,
    shortCode,
    createdAt: now,
    updatedAt: now,
  })

  for (const tagName of tags) {
    const tagId = `Tag-${uuid()}` as EARS.EntityId
    tx(tagId).put('name', tagName)
    tx(documentId).link(EARS.RelKind.HAS, tagId)
  }

  if (collectionId) {
    tx(collectionId).link(EARS.RelKind.CONTAINS, documentId)
  }

  const document = await getDocument(documentId)
  return document!
}

export async function updateDocument(
  id: EARS.EntityId,
  name: string,
  content: string,
  tags: string[],
  collectionId?: EARS.EntityId
): Promise<DocumentDTO> {
  const documentId = id
  const now = Date.now()

  tx(documentId)
    .batchPut({
      name,
      content,
      updatedAt: now,
    })
    
  const existingTags = await qx(documentId as EARS.EntityId)
    .linksTo(EARS.RelKind.HAS, EARS.Entity.Tag)
    .pickAll()

  // Remove all existing tags
  for (const tag of existingTags) {
    edgeStore.unlink({
      sourceEntity: documentId,
      relationType: EARS.RelKind.HAS,
      targetEntity: tag.id as EARS.EntityId
    })
    tx(tag.id as EARS.EntityId).destroy()
  }

  for (const tagName of tags) {
    const tagId = `Tag-${uuid()}` as EARS.EntityId
    tx(tagId).put('name', tagName)
    tx(documentId).link(EARS.RelKind.HAS, tagId)
  }

  // Find collections that contain this document
  const allCollections = await qx(EARS.Entity.Collection).pickAll()
  const collections = []
  for (const col of allCollections) {
    const docs = await qx(col.id as EARS.EntityId)
      .linksTo(EARS.RelKind.CONTAINS, EARS.Entity.Document)
      .ids()
    if (docs.includes(documentId as EARS.EntityId)) {
      collections.push(col)
    }
  }
  const currentCollection = collections[0]

  if (currentCollection && (!collectionId || currentCollection.id !== collectionId)) {
    edgeStore.unlink({
      sourceEntity: currentCollection.id as EARS.EntityId,
      relationType: EARS.RelKind.CONTAINS,
      targetEntity: documentId
    })
  }

  if (collectionId) {
    tx(collectionId).safeLink(EARS.RelKind.CONTAINS, documentId)
  }

  const document = await getDocument(documentId)
  return document!
}

export async function deleteDocument(id: EARS.EntityId): Promise<void> {
  const documentId = id

  const tags = await qx(documentId as EARS.EntityId)
    .linksTo(EARS.RelKind.HAS, EARS.Entity.Tag)
    .pickAll()

  // Remove all tags
  for (const tag of tags) {
    edgeStore.unlink({
      sourceEntity: documentId,
      relationType: EARS.RelKind.HAS,
      targetEntity: tag.id as EARS.EntityId
    })
    tx(tag.id as EARS.EntityId).destroy()
  }

  // Find collections that contain this document
  const allCollections = await qx(EARS.Entity.Collection).pickAll()
  const collections = []
  for (const col of allCollections) {
    const docs = await qx(col.id as EARS.EntityId)
      .linksTo(EARS.RelKind.CONTAINS, EARS.Entity.Document)
      .ids()
    if (docs.includes(documentId as EARS.EntityId)) {
      collections.push(col)
    }
  }
  const collection = collections[0]

  if (collection) {
    edgeStore.unlink({
      sourceEntity: collection.id as EARS.EntityId,
      relationType: EARS.RelKind.CONTAINS,
      targetEntity: documentId
    })
  }

  tx(documentId).destroy()
}

export async function getCollections(): Promise<CollectionDTO[]> {
  const allCollections = await qx(EARS.Entity.Collection)
    .pick(['name', 'description', 'createdAt', 'updatedAt'])
  
  const rootCollections = []
  for (const col of allCollections) {
    // Check if this collection has a parent (is a child of another collection)
    const allParents = await qx(EARS.Entity.Collection).pickAll()
    let hasParent = false
    for (const parent of allParents) {
      const children = await qx(parent.id as EARS.EntityId)
        .linksTo(EARS.RelKind.PARENT_OF, EARS.Entity.Collection)
        .ids()
      if (children.includes(col.id as EARS.EntityId)) {
        hasParent = true
        break
      }
    }
    if (!hasParent) {
      rootCollections.push(col)
    }
  }

  const buildCollectionTree = async (collections: any[]): Promise<CollectionDTO[]> => {
    return Promise.all(
      collections.map(async (col) => {
        const childCollections = await qx(col.id as EARS.EntityId)
          .linksTo(EARS.RelKind.PARENT_OF, EARS.Entity.Collection)
          .pick(['name', 'description', 'createdAt', 'updatedAt'])

        const documentCount = (await qx(col.id as EARS.EntityId)
          .linksTo(EARS.RelKind.CONTAINS, EARS.Entity.Document)
          .ids()).length

        const path = await getCollectionPath(col.id as EARS.EntityId)

        return {
          id: col.id,
          name: col.name as string,
          description: col.description as string | undefined,
          path,
          documentCount,
          childCollections: await buildCollectionTree(childCollections),
          createdAt: new Date(col.createdAt as number).toISOString(),
          updatedAt: new Date(col.updatedAt as number || col.createdAt as number).toISOString(),
        }
      })
    )
  }

  return buildCollectionTree(rootCollections)
}

export async function createCollection(
  name: string,
  description?: string,
  parentId?: EARS.EntityId
): Promise<CollectionDTO> {
  const collectionId = `Collection-${uuid()}` as EARS.EntityId
  const now = Date.now()

  const attrs: Record<string, any> = {
    name,
    createdAt: now,
    updatedAt: now,
  }

  if (description) {
    attrs.description = description
  }

  tx(collectionId).batchPut(attrs)
  if (parentId) {
    tx(parentId).link(EARS.RelKind.PARENT_OF, collectionId)
  }

  const path = await getCollectionPath(collectionId)

  return {
    id: collectionId,
    name,
    description,
    parentId,
    path,
    documentCount: 0,
    childCollections: [],
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
  }
}

export async function updateCollection(
  id: EARS.EntityId,
  name: string,
  description?: string
): Promise<CollectionDTO> {
  const collectionId = id
  const now = Date.now()

  const attrs: Record<string, any> = {
    name,
    updatedAt: now,
  }

  if (description !== undefined) {
    attrs.description = description
  }

  tx(collectionId).batchPut(attrs)
  const collections = await qx(collectionId).pickAll()
  const collection = collections[0]
  const documentCount = (await qx(collectionId)
    .linksTo(EARS.RelKind.CONTAINS, EARS.Entity.Document)
    .pickAll()).length

  const childCollections = await qx(collectionId)
    .linksTo(EARS.RelKind.PARENT_OF, EARS.Entity.Collection)
    .pick(['name', 'description', 'createdAt', 'updatedAt'])

  const path = await getCollectionPath(collectionId)

  const buildChildren = async (children: any[]): Promise<CollectionDTO[]> => {
    return Promise.all(
      children.map(async (child) => {
        const childDocCount = (await qx(child.id as EARS.EntityId)
          .linksTo(EARS.RelKind.CONTAINS, EARS.Entity.Document)
          .pickAll()).length
        const childPath = await getCollectionPath(child.id as EARS.EntityId)
        const grandChildren = await qx(child.id as EARS.EntityId)
          .linksTo(EARS.RelKind.PARENT_OF, EARS.Entity.Collection)
          .pick(['name', 'description', 'createdAt', 'updatedAt'])

        return {
          id: child.id,
          name: child.name as string,
          description: child.description as string | undefined,
          path: childPath,
          documentCount: childDocCount,
          childCollections: await buildChildren(grandChildren),
          createdAt: new Date(child.createdAt as number).toISOString(),
          updatedAt: new Date(child.updatedAt as number || child.createdAt as number).toISOString(),
        }
      })
    )
  }

  return {
    id: collectionId,
    name: collection!.name as string,
    description: collection!.description as string | undefined,
    path,
    documentCount,
    childCollections: await buildChildren(childCollections),
    createdAt: new Date(collection!.createdAt as number).toISOString(),
    updatedAt: new Date(collection!.updatedAt as number || collection!.createdAt as number).toISOString(),
  }
}

export async function deleteCollection(id: EARS.EntityId): Promise<void> {
  const collectionId = id

  const documents = await qx(collectionId)
    .linksTo(EARS.RelKind.CONTAINS, EARS.Entity.Document)
    .pickAll()

  for (const doc of documents) {
    edgeStore.unlink({
      sourceEntity: collectionId,
      relationType: EARS.RelKind.CONTAINS,
      targetEntity: doc.id as EARS.EntityId
    })
  }

  // Find parent collections
  const allCollections = await qx(EARS.Entity.Collection).pickAll()
  const parents = []
  for (const col of allCollections) {
    const children = await qx(col.id as EARS.EntityId)
      .linksTo(EARS.RelKind.PARENT_OF, EARS.Entity.Collection)
      .ids()
    if (children.includes(collectionId)) {
      parents.push(col)
    }
  }
  const parent = parents[0]

  if (parent) {
    edgeStore.unlink({
      sourceEntity: parent.id as EARS.EntityId,
      relationType: EARS.RelKind.PARENT_OF,
      targetEntity: collectionId
    })
  }

  const children = await qx(collectionId)
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

  tx(collectionId).destroy()
}

export async function moveDocument(
  documentId: EARS.EntityId,
  newCollectionId?: EARS.EntityId
): Promise<DocumentDTO> {
  const docId = documentId

  // Find collections that contain this document
  const allCollections = await qx(EARS.Entity.Collection).pickAll()
  const collections = []
  for (const col of allCollections) {
    const docs = await qx(col.id as EARS.EntityId)
      .linksTo(EARS.RelKind.CONTAINS, EARS.Entity.Document)
      .ids()
    if (docs.includes(docId)) {
      collections.push(col)
    }
  }
  const currentCollection = collections[0]

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

  const document = await getDocument(docId)
  return document!
}

async function getCollectionPath(collectionId: EARS.EntityId): Promise<string[]> {
  const path: string[] = []
  let currentId: EARS.EntityId | null = collectionId

  while (currentId) {
    const collections = await qx(currentId).pickAll()
    const collection = collections[0]
    if (collection) {
      path.unshift(collection.name as string)
    }

    // Find parent collections
    const allCollections = await qx(EARS.Entity.Collection).pickAll()
    const parents = []
    for (const col of allCollections) {
      const children = await qx(col.id as EARS.EntityId)
        .linksTo(EARS.RelKind.PARENT_OF, EARS.Entity.Collection)
        .ids()
      if (children.includes(currentId as EARS.EntityId)) {
        parents.push(col)
      }
    }
    const parent = parents[0]

    currentId = parent ? (parent.id as EARS.EntityId) : null
  }

  return path
}

// New file browser functions

export async function getFolderContents(folderId: EARS.EntityId | null): Promise<FolderContents> {
  const items: LibraryItem[] = []
  
  // Get folders (collections) in this directory
  let folders: any[] = []
  
  if (folderId === null) {
    // Root directory - get collections without parents
    const allCollections = await qx(EARS.Entity.Collection).pickAll()
    for (const col of allCollections) {
      const allParents = await qx(EARS.Entity.Collection).pickAll()
      let hasParent = false
      for (const parent of allParents) {
        const children = await qx(parent.id as EARS.EntityId)
          .linksTo(EARS.RelKind.PARENT_OF, EARS.Entity.Collection)
          .ids()
        if (children.includes(col.id as EARS.EntityId)) {
          hasParent = true
          break
        }
      }
      if (!hasParent) {
        folders.push(col)
      }
    }
  } else {
    // Get child collections of this folder
    folders = await qx(folderId)
      .linksTo(EARS.RelKind.PARENT_OF, EARS.Entity.Collection)
      .pick(['name', 'description', 'createdAt', 'updatedAt'])
  }
  
  // Convert collections to folder items
  for (const folder of folders) {
    const folderId = folder.id
    const childCollections = await qx(folder.id as EARS.EntityId)
      .linksTo(EARS.RelKind.PARENT_OF, EARS.Entity.Collection)
      .pickAll()
    const documents = await qx(folder.id as EARS.EntityId)
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
      createdAt: new Date(folder.createdAt as number).toISOString(),
      updatedAt: new Date(folder.updatedAt as number || folder.createdAt as number).toISOString(),
    })
  }
  
  // Get documents in this directory
  let documents: any[] = []
  
  if (folderId === null) {
    // Root directory - get documents not in any collection
    const allDocuments = await qx(EARS.Entity.Document).pickAll()
    for (const doc of allDocuments) {
      const allCollections = await qx(EARS.Entity.Collection).pickAll()
      let inCollection = false
      for (const col of allCollections) {
        const docs = await qx(col.id as EARS.EntityId)
          .linksTo(EARS.RelKind.CONTAINS, EARS.Entity.Document)
          .ids()
        if (docs.includes(doc.id as EARS.EntityId)) {
          inCollection = true
          break
        }
      }
      if (!inCollection) {
        documents.push(doc)
      }
    }
  } else {
    // Get documents in this collection
    documents = await qx(folderId)
      .linksTo(EARS.RelKind.CONTAINS, EARS.Entity.Document)
      .pick(['name', 'content', 'shortCode', 'createdAt', 'updatedAt'])
  }
  
  // Convert documents to document items
  for (const doc of documents) {
    const documentId = doc.id
    const content = doc.content as string || ''
    const contentLength = content.length
    const size = formatFileSize(contentLength)
    
    // Get tags
    const tags = await qx(doc.id as EARS.EntityId)
      .linksTo(EARS.RelKind.HAS, EARS.Entity.Tag)
      .pick(['name'])
    
    items.push({
      type: 'document',
      id: documentId,
      name: doc.name as string,
      shortCode: doc.shortCode as DocumentShortCode,
      parentId: folderId,
      content,
      tags: tags.map(tag => tag.name as string),
      size,
      kind: 'Document',
      createdAt: new Date(doc.createdAt as number).toISOString(),
      updatedAt: new Date(doc.updatedAt as number || doc.createdAt as number).toISOString(),
    })
  }
  
  // Get current path and breadcrumbs
  const currentPath = folderId ? await getCollectionPath(folderId) : []
  const breadcrumbs = await getFolderPath(folderId)
  
  return {
    items: items.sort((a, b) => {
      // Folders first, then documents, then alphabetical
      if (a.type !== b.type) {
        return a.type === 'folder' ? -1 : 1
      }
      return a.name.localeCompare(b.name)
    }),
    currentPath,
    currentFolderId: folderId,
    breadcrumbs,
  }
}

export async function getFolderPath(folderId: EARS.EntityId | null): Promise<BreadcrumbItem[]> {
  if (folderId === null) {
    return []
  }
  
  const breadcrumbs: BreadcrumbItem[] = []
  let currentId: EARS.EntityId | null = folderId
  
  // Walk up the parent chain to build breadcrumbs
  while (currentId) {
    const collections = await qx(currentId).pickAll()
    const collection = collections[0]
    if (collection) {
      breadcrumbs.unshift({
        id: currentId,
        name: collection.name as string,
        path: [], // We don't need path for breadcrumbs
      })
    }
    
    // Find parent
    const allCollections = await qx(EARS.Entity.Collection).pickAll()
    let parentId: EARS.EntityId | null = null
    for (const col of allCollections) {
      const children = await qx(col.id as EARS.EntityId)
        .linksTo(EARS.RelKind.PARENT_OF, EARS.Entity.Collection)
        .ids()
      if (children.includes(currentId)) {
        parentId = col.id as EARS.EntityId
        break
      }
    }
    currentId = parentId
  }
  
  return breadcrumbs
}

export async function getParentFolderId(folderId: EARS.EntityId): Promise<EARS.EntityId | null> {
  // Find parent collection
  const allCollections = await qx(EARS.Entity.Collection).pickAll()
  for (const col of allCollections) {
    const children = await qx(col.id as EARS.EntityId)
      .linksTo(EARS.RelKind.PARENT_OF, EARS.Entity.Collection)
      .ids()
    if (children.includes(folderId)) {
      return col.id as EARS.EntityId
    }
  }
  return null
}

export async function migrateDocumentShortCodes(): Promise<void> {
  // Get all documents
  const allDocuments = await qx(EARS.Entity.Document).pickAll()
  
  let migratedCount = 0
  for (let i = 0; i < allDocuments.length; i++) {
    const doc = allDocuments[i]
    
    // Check if document already has a shortCode
    if (!doc.shortCode) {
      const shortCode = `DOC-${i + 1}` as DocumentShortCode
      tx(doc.id as EARS.EntityId).put('shortCode', shortCode)
      migratedCount++
    }
  }
  
  if (migratedCount > 0) {
    console.log(`Migrated ${migratedCount} documents with shortcodes`)
  }
}

export async function renameItem(id: EARS.EntityId, name: string, type: 'document' | 'folder'): Promise<LibraryItem> {
  const entityId = id
  const now = Date.now()
  
  tx(entityId).batchPut({
    name,
    updatedAt: now,
  })
  
  if (type === 'document') {
    const doc = await getDocument(entityId)
    return {
      type: 'document',
      id: entityId,
      name,
      shortCode: doc!.shortCode,
      parentId: doc!.collectionId || null,
      content: doc!.content,
      tags: doc!.tags,
      size: formatFileSize(doc!.content.length),
      kind: 'Document',
      createdAt: doc!.createdAt,
      updatedAt: new Date(now).toISOString(),
    }
  } else {
    const collections = await qx(entityId).pickAll()
    const collection = collections[0]!
    const childCount = 0 // Simplified for now
    
    // Find parent folder
    const allCollections = await qx(EARS.Entity.Collection).pickAll()
    let parentId: EARS.EntityId | null = null
    for (const col of allCollections) {
      const children = await qx(col.id as EARS.EntityId)
        .linksTo(EARS.RelKind.PARENT_OF, EARS.Entity.Collection)
        .ids()
      if (children.includes(entityId)) {
        parentId = col.id as EARS.EntityId
        break
      }
    }
    
    return {
      type: 'folder',
      id: entityId,
      name,
      parentId,
      childCount,
      size: `${childCount} items`,
      kind: 'Folder',
      createdAt: new Date(collection.createdAt as number).toISOString(),
      updatedAt: new Date(now).toISOString(),
    }
  }
}

export async function deleteItems(ids: EARS.EntityId[]): Promise<void> {
  for (const id of ids) {
    // Check entity type from ID prefix
    if (id.startsWith('Document-')) {
      await deleteDocument(id as EARS.EntityId)
    } else if (id.startsWith('Collection-')) {
      await deleteCollection(id)
    }
  }
}

export async function moveItems(ids: EARS.EntityId[], targetFolderId: EARS.EntityId | null): Promise<void> {
  for (const id of ids) {
    // For now, only support moving documents
    if (id.startsWith('Document-')) {
      await moveDocument(id, targetFolderId || undefined)
    }
  }
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round((bytes / Math.pow(k, i)) * 10) / 10 + ' ' + sizes[i]
}

export async function getCollectionByName(name: string): Promise<CollectionDTO | null> {
  const collections = await qx(EARS.Entity.Collection)
    .where('name', name)
    .pickAll()
  
  if (collections.length === 0) {
    return null
  }
  
  const collection = collections[0]
  const documentCount = (await qx(collection.id as EARS.EntityId)
    .linksTo(EARS.RelKind.CONTAINS, EARS.Entity.Document)
    .ids()).length
  
  const childCollections = await qx(collection.id as EARS.EntityId)
    .linksTo(EARS.RelKind.PARENT_OF, EARS.Entity.Collection)
    .pickAll()
  
  const path = await getCollectionPath(collection.id as EARS.EntityId)
  
  return {
    id: collection.id as EARS.EntityId,
    name: collection.name as string,
    description: collection.description as string | undefined,
    path,
    documentCount,
    childCollections: childCollections as unknown as CollectionDTO[],
    createdAt: new Date(collection.createdAt as number).toISOString(),
    updatedAt: new Date(collection.updatedAt as number || collection.createdAt as number).toISOString(),
  }
}

export async function getDocumentsInCollection(collectionId: EARS.EntityId): Promise<DocumentDTO[]> {
  const documentIds = await qx(collectionId)
    .linksTo(EARS.RelKind.CONTAINS, EARS.Entity.Document)
    .ids()
  
  if (documentIds.length === 0) {
    return []
  }
  
  const documents = await Promise.all(
    documentIds.map((id) => getDocument(id))
  )
  
  return documents.filter((doc): doc is DocumentDTO => doc !== null)
}