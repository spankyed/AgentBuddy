import type { EARS, BaseEntity } from '@/core/types'

export type DocumentShortCode = `DOC-${number}`;

export type ContentType = 'field' | 'list' | 'markdown' | 'text' | 'code'

export interface FieldContent {
  type: 'field'
  fields: Array<{ key: string; value: string }>
}

export interface ListContent {
  type: 'list'
  items: string[]
}

export interface MarkdownContent {
  type: 'markdown'
  text: string
}

export interface TextContent {
  type: 'text'
  text: string
}

export interface CodeContent {
  type: 'code'
  text: string
  language: string
}

export type ContentSection = FieldContent | ListContent | MarkdownContent | TextContent | CodeContent

export interface Document extends BaseEntity {
  _type: EARS.Entity.Document
  name: string
  content: ContentSection[]
  shortCode: DocumentShortCode
  displayOrder?: number
  /** SHA256 hash of DSL source at last seed. Absent on user-created documents. */
  sourceHash?: string
}

export interface Collection extends BaseEntity {
  _type: EARS.Entity.Collection
  name: string
  description?: string
  displayOrder?: number
  symlinkPath?: string
  /** SHA256 hash of DSL source at last seed. Absent on user-created collections. */
  sourceHash?: string
}

export interface DocumentDTO {
  id: EARS.EntityId
  name: string
  content: ContentSection[]
  shortCode: DocumentShortCode
  tags: string[]
  collectionId?: EARS.EntityId
  collectionPath?: string[]
  displayOrder: number
  createdAt: string
  updatedAt: string
}

export interface CollectionDTO {
  id: EARS.EntityId
  name: string
  description?: string
  parentId?: EARS.EntityId
  path: string[]
  documentCount: number
  childCollections: CollectionDTO[]
  displayOrder: number
  createdAt: string
  updatedAt: string
  symlinkPath?: string
}

// New unified file browser types
export interface FolderItem {
  type: 'folder'
  id: EARS.EntityId
  name: string
  parentId: EARS.EntityId | null
  childCount: number
  size: string // Display as "-- items" or "X items"
  kind: 'Folder'
  displayOrder: number
  createdAt: string
  updatedAt: string
  isSymlink?: boolean
  symlinkPath?: string
  isSymlinked?: boolean
  isBroken?: boolean
}

export interface DocumentItem {
  type: 'document'
  id: EARS.EntityId
  name: string
  shortCode: DocumentShortCode
  parentId: EARS.EntityId | null
  content: ContentSection[]
  tags: string[]
  size: string // Content length formatted (e.g., "1.2 KB")
  kind: 'Document'
  displayOrder: number
  createdAt: string
  updatedAt: string
  isSymlinked?: boolean
  filePath?: string
}

export type LibraryItem = FolderItem | DocumentItem

export interface FolderContents {
  items: LibraryItem[]
  currentPath: string[]
  currentFolderId: EARS.EntityId | null
  breadcrumbs: BreadcrumbItem[]
  searchIndices?: any[] // Will be properly typed on frontend via schema
  isBroken?: boolean
  lastKnownPath?: string
}

export interface BreadcrumbItem {
  id: EARS.EntityId | null
  name: string
  path: string[]
}

export interface LibrarySystemContext {
  documents: DocumentDTO[]
  collections: CollectionDTO[]
  selectedDocumentId?: EARS.EntityId
  selectedCollectionId?: EARS.EntityId
  // New file browser context
  currentItems: LibraryItem[]
  currentFolderId: EARS.EntityId | null
  currentPath: string[]
}
