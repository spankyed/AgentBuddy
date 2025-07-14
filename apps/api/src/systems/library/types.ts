import type { EARS, BaseEntity } from '@/core/types'

export interface Document extends BaseEntity {
  _type: EARS.Entity.Document
  name: string
  content: string
}

export interface Collection extends BaseEntity {
  _type: EARS.Entity.Collection
  name: string
  description?: string
}

export interface DocumentDTO {
  id: string
  name: string
  content: string
  tags: string[]
  collectionId?: string
  collectionPath?: string[]
  createdAt: string
  updatedAt: string
}

export interface CollectionDTO {
  id: string
  name: string
  description?: string
  parentId?: string
  path: string[]
  documentCount: number
  childCollections: CollectionDTO[]
  createdAt: string
  updatedAt: string
}

// New unified file browser types
export interface FolderItem {
  type: 'folder'
  id: string
  name: string
  parentId: string | null
  childCount: number
  size: string // Display as "-- items" or "X items"
  kind: 'Folder'
  createdAt: string
  updatedAt: string
}

export interface DocumentItem {
  type: 'document'
  id: string
  name: string
  parentId: string | null
  content: string
  tags: string[]
  size: string // Content length formatted (e.g., "1.2 KB")
  kind: 'Document'
  createdAt: string
  updatedAt: string
}

export type LibraryItem = FolderItem | DocumentItem

export interface FolderContents {
  items: LibraryItem[]
  currentPath: string[]
  currentFolderId: string | null
}

export interface BreadcrumbItem {
  id: string | null
  name: string
  path: string[]
}

export interface LibrarySystemContext {
  documents: DocumentDTO[]
  collections: CollectionDTO[]
  selectedDocumentId?: string
  selectedCollectionId?: string
  // New file browser context
  currentItems: LibraryItem[]
  currentFolderId: string | null
  currentPath: string[]
}