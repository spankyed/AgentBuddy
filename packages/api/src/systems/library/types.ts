// Re-export all shared library types
export * from '@/core/shared-types/library';

// Library-internal re-exports from search-index subsystem
export type { ModelProvider, EmbeddingModelId, EmbeddingModelConfig } from '@/systems/library/search-index/types/embedding-models'
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
