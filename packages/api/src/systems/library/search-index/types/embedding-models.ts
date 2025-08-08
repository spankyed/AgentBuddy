// Embedding model type definitions
export type ModelProvider = 'fastembed' | 'openai'

export type EmbeddingModelId = 
  | 'minilm-l6-v2'
  | 'bge-small-en'
  | 'bge-small-en-v1.5'
  | 'bge-base-en'
  | 'bge-base-en-v1.5'
  | 'e5-large-multilingual'
  | 'text-embedding-3-small'
  | 'text-embedding-3-large'

export interface EmbeddingModelConfig {
  id: string
  displayName: string
  description: string
  provider: ModelProvider
  dimensions: number
  fastEmbedModel?: string  // String identifier for the FastEmbed model
  apiModelName?: string
  maxTokens?: number
  speed: 'fast' | 'medium' | 'slow'
  quality: 'good' | 'better' | 'best'
}