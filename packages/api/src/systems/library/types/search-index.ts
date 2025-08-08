import type { EARS } from '@/core/types'
import type { ContentSection } from '../types'

import type { EmbeddingModelId } from './embedding-models'

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
  documentCount: number // Number of indexed documents
  vectorDimensions: number // Dimension of vectors (384, 1536, 3072)
  createdAt: number
  updatedAt: number
}

export interface IndexedDocument {
  documentId: EARS.EntityId
  vectorId: number // USearch internal ID
  embedding: Float32Array
  text: string // The processed text that was embedded
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
}

export interface EmbeddingResult {
  text: string
  embedding: Float32Array
  model: EmbeddingModel
}