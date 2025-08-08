import type { EARS } from '@app/api'

type ContentType = 'field' | 'list' | 'text'

export type EmbeddingModel = 'text-embedding-3-small' | 'text-embedding-3-large' | 'all-MiniLM-L6-v2'
export type IndexMetric = 'cosine' | 'dot_product'

export interface SegmentRule {
  id: string
  type: ContentType
  occurrence: string // "first" | "last" | "all" | N | N-X
  key?: string // Only for 'field' type
}

export interface SearchIndexConfig {
  // Details tab
  name: string
  description: string
  embeddingModel: EmbeddingModel
  indexMetric: IndexMetric
  connectors: number // 8, 16, 32, 64

  // Scope tab
  excludeAllSubfolders: boolean
  excludedFolderIds: EARS.EntityId[]
  excludedDocumentIds: EARS.EntityId[]

  // Sections tab
  enableSectionIndexing: boolean
  segmentRules: SegmentRule[]
  constructTemplate: string // e.g., "{{segment 1}}: {{segment 2}}"
}

export interface SearchIndexFormData extends SearchIndexConfig {
  id?: EARS.EntityId
  createdAt?: string
  updatedAt?: string
}