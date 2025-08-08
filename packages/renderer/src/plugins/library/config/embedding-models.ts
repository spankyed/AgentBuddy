// Client-side embedding model configuration
// This duplicates the backend configuration to avoid importing runtime code from the API

import type { EmbeddingModelId, EmbeddingModelConfig, ModelProvider } from '@app/api'

// Model ID constants for type safety
export const EMBEDDING_MODELS = {
  // FastEmbed local models
  MINILM_L6_V2: 'minilm-l6-v2',
  BGE_SMALL_EN: 'bge-small-en',
  BGE_SMALL_EN_V15: 'bge-small-en-v1.5',
  BGE_BASE_EN: 'bge-base-en',
  BGE_BASE_EN_V15: 'bge-base-en-v1.5',
  E5_LARGE_MULTILINGUAL: 'e5-large-multilingual',
  
  // OpenAI API models
  OPENAI_SMALL: 'text-embedding-3-small',
  OPENAI_LARGE: 'text-embedding-3-large',
} as const

export const EMBEDDING_MODEL_CONFIGS: Record<EmbeddingModelId, EmbeddingModelConfig> = {
  // FastEmbed local models
  [EMBEDDING_MODELS.MINILM_L6_V2]: {
    id: EMBEDDING_MODELS.MINILM_L6_V2,
    displayName: 'MiniLM-L6-v2',
    description: 'Lightweight and fast local model, good for general English text',
    provider: 'fastembed' as ModelProvider,
    dimensions: 384,
    fastEmbedModel: 'AllMiniLML6V2',
    maxTokens: 256,
    speed: 'fast',
    quality: 'good',
  },
  [EMBEDDING_MODELS.BGE_SMALL_EN]: {
    id: EMBEDDING_MODELS.BGE_SMALL_EN,
    displayName: 'BGE Small English',
    description: 'Balanced local model for English text',
    provider: 'fastembed' as ModelProvider,
    dimensions: 384,
    fastEmbedModel: 'BGESmallEN',
    maxTokens: 512,
    speed: 'fast',
    quality: 'better',
  },
  [EMBEDDING_MODELS.BGE_SMALL_EN_V15]: {
    id: EMBEDDING_MODELS.BGE_SMALL_EN_V15,
    displayName: 'BGE Small English v1.5',
    description: 'Latest BGE small model, top MTEB performance',
    provider: 'fastembed' as ModelProvider,
    dimensions: 384,
    fastEmbedModel: 'BGESmallENV15',
    maxTokens: 512,
    speed: 'fast',
    quality: 'better',
  },
  [EMBEDDING_MODELS.BGE_BASE_EN]: {
    id: EMBEDDING_MODELS.BGE_BASE_EN,
    displayName: 'BGE Base English',
    description: 'Larger local model with better accuracy',
    provider: 'fastembed' as ModelProvider,
    dimensions: 768,
    fastEmbedModel: 'BGEBaseEN',
    maxTokens: 512,
    speed: 'medium',
    quality: 'better',
  },
  [EMBEDDING_MODELS.BGE_BASE_EN_V15]: {
    id: EMBEDDING_MODELS.BGE_BASE_EN_V15,
    displayName: 'BGE Base English v1.5',
    description: 'Latest BGE base model with improved performance',
    provider: 'fastembed' as ModelProvider,
    dimensions: 768,
    fastEmbedModel: 'BGEBaseENV15',
    maxTokens: 512,
    speed: 'medium',
    quality: 'best',
  },
  [EMBEDDING_MODELS.E5_LARGE_MULTILINGUAL]: {
    id: EMBEDDING_MODELS.E5_LARGE_MULTILINGUAL,
    displayName: 'E5 Large Multilingual',
    description: 'Large multilingual model for diverse languages',
    provider: 'fastembed' as ModelProvider,
    dimensions: 1024,
    fastEmbedModel: 'MLE5Large',
    maxTokens: 512,
    speed: 'slow',
    quality: 'best',
  },
  
  // OpenAI API models
  [EMBEDDING_MODELS.OPENAI_SMALL]: {
    id: EMBEDDING_MODELS.OPENAI_SMALL,
    displayName: 'OpenAI Small',
    description: 'Fast and efficient OpenAI model (requires API key)',
    provider: 'openai' as ModelProvider,
    dimensions: 1536,
    apiModelName: 'text-embedding-3-small',
    maxTokens: 8191,
    speed: 'fast',
    quality: 'better',
  },
  [EMBEDDING_MODELS.OPENAI_LARGE]: {
    id: EMBEDDING_MODELS.OPENAI_LARGE,
    displayName: 'OpenAI Large',
    description: 'Highest quality OpenAI model (requires API key)',
    provider: 'openai' as ModelProvider,
    dimensions: 3072,
    apiModelName: 'text-embedding-3-large',
    maxTokens: 8191,
    speed: 'medium',
    quality: 'best',
  },
}

// Helper functions
export function getModelConfig(modelId: string): EmbeddingModelConfig | undefined {
  return EMBEDDING_MODEL_CONFIGS[modelId as EmbeddingModelId]
}

export function getModelDimensions(modelId: string): number {
  const config = getModelConfig(modelId)
  return config?.dimensions ?? 384 // Default to 384 if model not found
}

export function getLocalModels(): EmbeddingModelConfig[] {
  return Object.values(EMBEDDING_MODEL_CONFIGS).filter(m => m.provider === 'fastembed')
}

export function getApiModels(): EmbeddingModelConfig[] {
  return Object.values(EMBEDDING_MODEL_CONFIGS).filter(m => m.provider === 'openai')
}

