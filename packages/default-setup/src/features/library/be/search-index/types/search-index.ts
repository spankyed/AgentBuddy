import type { EARS } from '@/core/types'
import type { ContentSection } from '@/systems/library/types'
import type { EmbeddingModelId } from '@/systems/library/search-index/types/embedding-models'

export type EmbeddingModel = EmbeddingModelId
export type IndexMetric = 'cosine' | 'dot_product'

export type Occurrence =
  | 'first'
  | 'last'
  | 'all'
  | { index: number }
  | { from: number; to: number }

export interface SegmentRule {
  id: string
  type: 'text' | 'list' | 'field'
  occurrence: string // String representation of Occurrence
  key?: string // Only for 'field' type
  indexMode: 'combined' | 'separate' // For list and field types - how to index items
}

export interface SearchIndexConfig {
  // Details
  name: string
  description: string
  embeddingModel: EmbeddingModel
  indexMetric: IndexMetric
  connectors: number // 8, 16, 32, 64

  // Scope
  excludeAllSubfolders: boolean
  excludedFolderIds: EARS.EntityId[]
  excludedDocumentIds: EARS.EntityId[]

  // Sections
  enableSectionIndexing: boolean
  segmentRules: SegmentRule[]
  constructTemplate: string
}

export interface SearchIndex extends SearchIndexConfig {
  id: EARS.EntityId
  folderId: EARS.EntityId | null // The folder this index belongs to
  documentCount: number // Number of indexed items (documents or chunks when using separate mode)
  vectorDimensions: number // Dimension of vectors (384, 1536, 3072)
  createdAt: number
  updatedAt: number
}

export interface ChunkInfo {
  sourceDocId: EARS.EntityId
  segmentIndex: number  // Which segment rule this came from
  itemIndex?: number    // For separated lists/fields - which item
  totalChunks: number   // Total chunks from this document
  chunkType: 'full' | 'segment-item' // Whether it's a full doc or segment item
  chunkKey: string      // Unique identifier for this chunk
}

export interface IndexedDocument {
  documentId: EARS.EntityId
  vectorId: number // USearch internal ID
  embedding?: Float32Array // Optional - not stored to save memory
  text: string // The processed text that was embedded
  chunkInfo?: ChunkInfo // Information about the chunk
  metadata: {
    shortCode: string
    name: string
    indexedAt: number
  }
}

export interface IndexSearchResult {
  documentId: EARS.EntityId
  score: number // Similarity score
  text: string
  metadata: IndexedDocument['metadata']
  chunkInfo?: ChunkInfo // Optional chunk information for multi-indexed content
}

export interface EmbeddingResult {
  text: string
  embedding: Float32Array
  model: EmbeddingModel
}

export interface IndexedDocEntity {
  id: EARS.EntityId
  shortCode: string
  indexId: string
  chunkKey: string
  documentId: EARS.EntityId
  vectorId: number
  text: string
  metadata: {
    shortCode: string
    name: string
    indexedAt: number
  }
  chunkInfo?: ChunkInfo
}

export interface IndexedDocCreateData {
  indexId: string
  chunkKey: string
  documentId: EARS.EntityId
  vectorId: number
  text: string
  metadata: {
    shortCode: string
    name: string
    indexedAt: number
  }
  chunkInfo?: ChunkInfo
}

export interface IndexedDocUpdateData {
  documentId?: EARS.EntityId
  vectorId?: number
  text?: string
  metadata?: {
    shortCode: string
    name: string
    indexedAt: number
  }
  chunkInfo?: ChunkInfo
}