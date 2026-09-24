import type { EARS, BaseEntity } from '@/__generated__/ears'

export type DocumentShortCode = `DOC-${number}`;

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

/** A section of a document's content, as the library compiler parses it from markdown */
export type ContentSection = FieldContent | ListContent | MarkdownContent | TextContent | CodeContent

export type ContentType = ContentSection['type']

export interface DocumentEntity extends BaseEntity {
  _type: EARS.Entity.Document
  name: string
  content: ContentSection[]
  shortCode: DocumentShortCode
  displayOrder?: number
  /** Free-form tags, stored directly on the document as a string array. */
  tags?: string[]
  /** Hash of the seed source at last seed. Absent on user-created documents. */
  sourceHash?: string
}

export interface CollectionEntity extends BaseEntity {
  _type: EARS.Entity.Collection
  name: string
  description?: string
  displayOrder?: number
  symlinkPath?: string
  /** Hash of the seed source at last seed. Absent on user-created collections. */
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

/**
 * Every document and folder in the library, by name: what the reference picker offers and the
 * panel counts. The file browser reads one folder at a time through `FolderContents` instead.
 */
export interface LibraryIndex {
  documents: Array<{ id: EARS.EntityId; name: string; shortCode: DocumentShortCode; tags: string[] }>
  folders: Array<{ id: EARS.EntityId; name: string }>
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

// Library-internal re-exports from search-index subsystem
export type { SearchEmbeddingModel, SearchEmbeddingModelId, LocalEmbeddingModel, InferenceEmbeddingModel } from '../embedding-models'
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

export type IncomingLibraryEvents =
  | { type: 'CREATE_DOCUMENT'; name: string; content: ContentSection[]; tags: string[]; collectionId?: string }
  | { type: 'UPDATE_DOCUMENT'; id: string; name: string; content: ContentSection[]; tags: string[]; collectionId?: string }
  | { type: 'DELETE_DOCUMENT'; id: string }
  | { type: 'GET_DOCUMENT'; id: string }
  | { type: 'GET_LIBRARY_INDEX' }
  | { type: 'CREATE_COLLECTION'; name: string; description?: string; parentId?: string }
  | { type: 'UPDATE_COLLECTION'; id: string; name: string; description?: string }
  | { type: 'DELETE_COLLECTION'; id: string }
  | { type: 'MOVE_DOCUMENT'; documentId: string; collectionId?: string }
  // File browser events
  | { type: 'GET_FOLDER_CONTENTS'; folderId: string | null }
  | { type: 'NAVIGATE_TO_FOLDER'; folderId: string | null }
  | { type: 'RENAME_ITEM'; id: string; name: string; itemType: 'document' | 'folder' }
  | { type: 'DELETE_ITEMS'; ids: string[] }
  | { type: 'MOVE_ITEMS'; ids: string[]; targetFolderId: string | null }
  // [SEARCH_INDEX_FF] Search index events — commented out
  // Symlink events
  | { type: 'CREATE_SYMLINK_COLLECTION'; name: string; symlinkPath: string; parentId?: string }
  | { type: 'UPDATE_SYMLINK_PATH'; collectionId: string; newPath: string }
  // Import/Export events
  | { type: 'IMPORT_LIBRARY'; directory: string }
  | { type: 'EXPORT_LIBRARY'; directory: string; format: 'markdown' | 'json' }

export type OutgoingLibraryEvents =
  | { type: 'LIBRARY_CONNECTED'; data: { index: LibraryIndex; settings: any } }
  | { type: 'DOCUMENT_CREATED'; data: { document: DocumentDTO } }
  | { type: 'DOCUMENT_UPDATED'; data: { document: DocumentDTO } }
  | { type: 'DOCUMENT_DELETED'; data: { documentId: string } }
  | { type: 'DOCUMENT_LOADED'; data: { document: DocumentDTO } }
  | { type: 'COLLECTION_CREATED'; data: { collection: CollectionDTO } }
  | { type: 'COLLECTION_UPDATED'; data: { collection: CollectionDTO } }
  | { type: 'COLLECTION_DELETED'; data: { collectionId: string } }
  | { type: 'LIBRARY_INDEX_LOADED'; data: { index: LibraryIndex } }
  | { type: 'LIBRARY_ERROR'; data: { error: string } }
  // Symlink events
  | { type: 'SYMLINK_UPDATED'; data: { collection: CollectionDTO } }
  // File browser events
  | { type: 'FOLDER_CONTENTS_LOADED'; data: FolderContents }
  | { type: 'NAVIGATION_CHANGED'; data: { folderId: string | null; path: string[] } }
  | { type: 'ITEM_RENAMED'; data: { item: LibraryItem } }
  | { type: 'ITEMS_DELETED'; data: { ids: string[] } }
  | { type: 'ITEMS_MOVED'; data: { ids: string[]; targetFolderId: string | null } }
  // [SEARCH_INDEX_FF] Search index events — commented out
  // | { type: 'SEARCH_INDICES_LOADED'; data: { indices: SearchIndex[] } }
  // | { type: 'SEARCH_INDEX_CREATED'; data: { index: SearchIndex } }
  // | { type: 'SEARCH_INDEX_UPDATED'; data: { index: SearchIndex } }
  // | { type: 'SEARCH_INDEX_DELETED'; data: { indexId: string } }
  // | { type: 'SEARCH_RESULTS'; data: { results: any[] } }
  // | { type: 'INDEXING_PROGRESS'; data: { indexId: string; progress: number; total: number } }
  // Import/Export events
  | { type: 'LIBRARY_IMPORTED'; count: number; errors?: string[] }
  | { type: 'LIBRARY_IMPORT_FAILED'; errors: string[] }
  | { type: 'LIBRARY_EXPORTED'; filePath: string; itemCount: number }
  | { type: 'LIBRARY_EXPORT_FAILED'; errors: string[] }
