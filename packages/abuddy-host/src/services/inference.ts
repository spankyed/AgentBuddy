// services.inference: AI SDK 7 calls on the provider a `provider:model` id names, with the user's key
// for that provider. A provider's package loads on its first call.
import type { EARS } from '@abuddy/sdk';
import { createInferenceService, type ResolveModel, type ProviderName } from '@abuddy/sdk/services';
import { parseModelId, providerCapabilities, providerLabels, type ModelKind } from '@abuddy/sdk/models';
import { settingsRepository } from '../settings/index.ts';

/** A provider package's factory: the provider it builds has a method per kind of model it gives */
type ProviderFactory = (options: { apiKey: string }) => object;

const MODEL_METHODS = {
  language: 'languageModel',
  embedding: 'embeddingModel',
  image: 'imageModel',
  speech: 'speechModel',
  transcription: 'transcriptionModel',
} as const satisfies Record<ModelKind, string>;

const PROVIDERS: Record<ProviderName, () => Promise<ProviderFactory>> = {
  anthropic: async () => (await import('@ai-sdk/anthropic')).createAnthropic,
  openai: async () => (await import('@ai-sdk/openai')).createOpenAI,
  google: async () => (await import('@ai-sdk/google')).createGoogle,
  groq: async () => (await import('@ai-sdk/groq')).createGroq,
  mistral: async () => (await import('@ai-sdk/mistral')).createMistral,
  cohere: async () => (await import('@ai-sdk/cohere')).createCohere,
};

/** The user's key for a provider: Settings → Secrets, else `<PROVIDER>_API_KEY` */
function apiKey(provider: ProviderName): string {
  const secretId = settingsRepository.settingsQueries.getGeneralSettings().secrets?.[provider];
  const stored = typeof secretId === 'string' ? settingsRepository.secretsQueries.getSecret(secretId as EARS.EntityId)?.encryptedValue : undefined;
  const key = stored || process.env[`${provider.toUpperCase()}_API_KEY`];
  if (!key) throw new Error(`No API key for ${provider}: add one in Settings → Secrets, or set ${provider.toUpperCase()}_API_KEY`);
  return key;
}

/** The AI SDK model of `kind` an id names, built with its provider's current key */
export const model: ResolveModel = async (kind, id) => {
  const parts = parseModelId(id);
  if (!parts) throw new Error(`Unknown model provider in "${id}": expected one of ${Object.keys(PROVIDERS).join(', ')}, as provider:model`);
  if (!(providerCapabilities[parts.provider] as readonly ModelKind[]).includes(kind)) {
    throw new Error(`${providerLabels[parts.provider]} doesn't provide ${kind} models ("${id}")`);
  }
  const provider = (await PROVIDERS[parts.provider]())({ apiKey: apiKey(parts.provider) }) as Record<string, (modelId: string) => never>;
  return provider[MODEL_METHODS[kind]](parts.model);
};

export const inference = createInferenceService(model);
