import { EmbeddingModel as FastEmbedModel } from 'fastembed'

// Server-side mapping from string IDs to FastEmbed enum values
export const FASTEMBED_MODEL_MAPPING: Record<string, FastEmbedModel> = {
  'AllMiniLML6V2': FastEmbedModel.AllMiniLML6V2,
  'BGESmallEN': FastEmbedModel.BGESmallEN,
  'BGESmallENV15': FastEmbedModel.BGESmallENV15,
  'BGEBaseEN': FastEmbedModel.BGEBaseEN,
  'BGEBaseENV15': FastEmbedModel.BGEBaseENV15,
  'MLE5Large': FastEmbedModel.MLE5Large,
}

export function getFastEmbedModel(modelKey: string): FastEmbedModel | undefined {
  return FASTEMBED_MODEL_MAPPING[modelKey]
}