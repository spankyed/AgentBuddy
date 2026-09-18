// services.inference: AI SDK 7 calls on the provider a `provider:model` id names, with the key the user selected
// for that provider in Settings → Secrets (never the environment: each provider gets an explicit key), at the
// provider's own URL (never the environment either: each provider gets an explicit `baseURL`, so
// `ANTHROPIC_BASE_URL`/`OPENAI_BASE_URL` can't redirect a call). A provider's package loads on its first call.
import { _createInferenceService, type _ResolveModel, type ProviderName } from '@abuddy/sdk/services';
import { parseModelId, providerCapabilities, providerLabels, PROVIDER_BASE_URLS, type ModelKind } from '@abuddy/sdk/models';
import { secretsStore } from '../secrets/index.ts';

/** A provider package's factory: the provider it builds has a method per kind of model it gives */
type ProviderFactory = (options: { apiKey: string; baseURL: string }) => object;

const MODEL_METHODS = {
  language: 'languageModel',
  embedding: 'embeddingModel',
  image: 'imageModel',
  speech: 'speechModel',
  transcription: 'transcriptionModel',
  reranking: 'rerankingModel',
} as const satisfies Record<ModelKind, string>;

const PROVIDERS: Record<ProviderName, () => Promise<ProviderFactory>> = {
  anthropic: async () => (await import('@ai-sdk/anthropic')).createAnthropic,
  openai: async () => (await import('@ai-sdk/openai')).createOpenAI,
  google: async () => (await import('@ai-sdk/google')).createGoogle,
  groq: async () => (await import('@ai-sdk/groq')).createGroq,
  mistral: async () => (await import('@ai-sdk/mistral')).createMistral,
  cohere: async () => (await import('@ai-sdk/cohere')).createCohere,
};


/**
 * Resolves `provider:model` ids to AI SDK models, each provider called at its URL in `PROVIDER_BASE_URLS`.
 *
 * @internal `baseUrls` is a host-internal override for tests, which point a provider at a local server. It is not
 * reachable from a pack: the app's own resolver, `model` below, passes none.
 */
export function createModelResolver(options: { baseUrls?: Partial<Record<ProviderName, string>> } = {}): _ResolveModel {
  return (async (kind: ModelKind, id: string): Promise<unknown> => {
    const parts = parseModelId(id);
    if (!parts) throw new Error(`Unknown model provider in "${id}": expected one of ${Object.keys(PROVIDERS).join(', ')}, as provider:model`);
    if (!(providerCapabilities[parts.provider] as readonly ModelKind[]).includes(kind)) {
      throw new Error(`${providerLabels[parts.provider]} doesn't provide ${kind} models ("${id}")`);
    }
    const baseURL = options.baseUrls?.[parts.provider] ?? PROVIDER_BASE_URLS[parts.provider];
    const provider = (await PROVIDERS[parts.provider]())({ apiKey: secretsStore.keyFor(parts.provider), baseURL }) as Record<string, (modelId: string) => never>;
    return provider[MODEL_METHODS[kind]](parts.model);
  }) as _ResolveModel;
}

/** The AI SDK model of `kind` an id names, built with its provider's current key */
export const model = createModelResolver();

export const inference = _createInferenceService(model);
