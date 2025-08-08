import type { EARS, BaseEntity } from '@/core/types'

// Re-export embedding model types
export type { ModelProvider, EmbeddingModelId, EmbeddingModelConfig } from '@/systems/library/search-index/types/embedding-models'
// Re-export search index types  
export type {
  EmbeddingModel,
  IndexMetric,
  Occurrence,
  SegmentRule,
  SearchIndexConfig,
  SearchIndex,
  IndexedDocument,
  IndexSearchResult,
  EmbeddingResult
} from './search-index/types/search-index'

export type DocumentShortCode = `DOC-${number}`;

export type ContentType = 'field' | 'list' | 'text'

export interface FieldContent {
  type: 'field'
  fields: Array<{ key: string; value: string }>
}

export interface ListContent {
  type: 'list'
  items: string[]
}

export interface TextBlockContent {
  type: 'text'
  text: string
}

export type ContentSection = FieldContent | ListContent | TextBlockContent

export interface Document extends BaseEntity {
  _type: EARS.Entity.Document
  name: string
  content: ContentSection[]
  shortCode: DocumentShortCode
}

export interface Collection extends BaseEntity {
  _type: EARS.Entity.Collection
  name: string
  description?: string
}

export interface DocumentDTO {
  id: EARS.EntityId
  name: string
  content: ContentSection[]
  shortCode: DocumentShortCode
  tags: string[]
  collectionId?: EARS.EntityId
  collectionPath?: string[]
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
  createdAt: string
  updatedAt: string
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
  createdAt: string
  updatedAt: string
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
  createdAt: string
  updatedAt: string
}

export type LibraryItem = FolderItem | DocumentItem

export interface FolderContents {
  items: LibraryItem[]
  currentPath: string[]
  currentFolderId: EARS.EntityId | null
  breadcrumbs: BreadcrumbItem[]
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