// The embedding models a library search index can use (plain data, shared by the backend and the index editor):
// local models FastEmbed runs, and API models services.inference runs with the user's key for their provider.
// The search index is dormant: see be/search-index/README.md.
import type { EmbeddingModelId } from '@abuddy/sdk/models'

interface EmbeddingModelInfo {
  displayName: string
  description: string
  dimensions: number
  maxTokens?: number
  speed: 'fast' | 'medium' | 'slow'
  quality: 'good' | 'better' | 'best'
}

export const LOCAL_EMBEDDING_MODELS = {
  MINILM_L6_V2: 'minilm-l6-v2',
  BGE_SMALL_EN: 'bge-small-en',
  BGE_SMALL_EN_V15: 'bge-small-en-v1.5',
  BGE_BASE_EN: 'bge-base-en',
  BGE_BASE_EN_V15: 'bge-base-en-v1.5',
  E5_LARGE_MULTILINGUAL: 'e5-large-multilingual',
} as const

export type LocalEmbeddingModelId = (typeof LOCAL_EMBEDDING_MODELS)[keyof typeof LOCAL_EMBEDDING_MODELS]

/** A model FastEmbed runs in the app; its weights download to the models cache on first use */
export interface LocalEmbeddingModel extends EmbeddingModelInfo {
  kind: 'local'
  id: LocalEmbeddingModelId
  /** FastEmbed's name for the model */
  fastEmbedModel: string
}

/** A model services.inference runs, named by its provider:model id */
export interface InferenceEmbeddingModel extends EmbeddingModelInfo {
  kind: 'inference'
  id: EmbeddingModelId
}

export type SearchEmbeddingModel = LocalEmbeddingModel | InferenceEmbeddingModel
export type SearchEmbeddingModelId = SearchEmbeddingModel['id']

export const DEFAULT_EMBEDDING_MODEL: LocalEmbeddingModelId = LOCAL_EMBEDDING_MODELS.BGE_SMALL_EN_V15

export const EMBEDDING_MODELS: readonly SearchEmbeddingModel[] = [
  {
    kind: 'local',
    id: LOCAL_EMBEDDING_MODELS.MINILM_L6_V2,
    displayName: 'MiniLM-L6-v2',
    description: 'Lightweight and fast local model, good for general English text',
    dimensions: 384,
    fastEmbedModel: 'AllMiniLML6V2',
    maxTokens: 256,
    speed: 'fast',
    quality: 'good',
  },
  {
    kind: 'local',
    id: LOCAL_EMBEDDING_MODELS.BGE_SMALL_EN,
    displayName: 'BGE Small English',
    description: 'Balanced local model for English text',
    dimensions: 384,
    fastEmbedModel: 'BGESmallEN',
    maxTokens: 512,
    speed: 'fast',
    quality: 'better',
  },
  {
    kind: 'local',
    id: LOCAL_EMBEDDING_MODELS.BGE_SMALL_EN_V15,
    displayName: 'BGE Small English v1.5',
    description: 'Latest BGE small model, top MTEB performance',
    dimensions: 384,
    fastEmbedModel: 'BGESmallENV15',
    maxTokens: 512,
    speed: 'fast',
    quality: 'better',
  },
  {
    kind: 'local',
    id: LOCAL_EMBEDDING_MODELS.BGE_BASE_EN,
    displayName: 'BGE Base English',
    description: 'Larger local model with better accuracy',
    dimensions: 768,
    fastEmbedModel: 'BGEBaseEN',
    maxTokens: 512,
    speed: 'medium',
    quality: 'better',
  },
  {
    kind: 'local',
    id: LOCAL_EMBEDDING_MODELS.BGE_BASE_EN_V15,
    displayName: 'BGE Base English v1.5',
    description: 'Latest BGE base model with improved performance',
    dimensions: 768,
    fastEmbedModel: 'BGEBaseENV15',
    maxTokens: 512,
    speed: 'medium',
    quality: 'best',
  },
  {
    kind: 'local',
    id: LOCAL_EMBEDDING_MODELS.E5_LARGE_MULTILINGUAL,
    displayName: 'E5 Large Multilingual',
    description: 'Large multilingual model for diverse languages',
    dimensions: 1024,
    fastEmbedModel: 'MLE5Large',
    maxTokens: 512,
    speed: 'slow',
    quality: 'best',
  },
  {
    kind: 'inference',
    id: 'openai:text-embedding-3-small',
    displayName: 'OpenAI Small',
    description: 'Fast and efficient OpenAI model (requires an OpenAI key)',
    dimensions: 1536,
    maxTokens: 8191,
    speed: 'fast',
    quality: 'better',
  },
  {
    kind: 'inference',
    id: 'openai:text-embedding-3-large',
    displayName: 'OpenAI Large',
    description: 'Highest quality OpenAI model (requires an OpenAI key)',
    dimensions: 3072,
    maxTokens: 8191,
    speed: 'medium',
    quality: 'best',
  },
]

export function getModelConfig(modelId: string): SearchEmbeddingModel | undefined {
  return EMBEDDING_MODELS.find((model) => model.id === modelId)
}

export function getModelDimensions(modelId: string): number {
  return getModelConfig(modelId)?.dimensions ?? 384
}

export const getLocalModels = (): LocalEmbeddingModel[] => EMBEDDING_MODELS.filter((model): model is LocalEmbeddingModel => model.kind === 'local')

export const getInferenceModels = (): InferenceEmbeddingModel[] => EMBEDDING_MODELS.filter((model): model is InferenceEmbeddingModel => model.kind === 'inference')
