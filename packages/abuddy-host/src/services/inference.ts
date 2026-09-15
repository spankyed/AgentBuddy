// services.inference: AI SDK 7 calls on the provider a `provider:model` id names, with the user's key
// for that provider. A provider's package loads on its first call.
import type { LanguageModel } from 'ai';
import type { EARS } from '@abuddy/sdk';
import { createInferenceService, type ModelId, type ProviderName } from '@abuddy/sdk/services';
import { parseModelId } from '@abuddy/sdk/models';
import { settingsRepository } from '../settings/index.ts';

type ProviderFactory = (options: { apiKey: string }) => { languageModel(modelId: string): LanguageModel };

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

/** The AI SDK model an id names, built with the provider's current key */
export async function languageModel(id: ModelId): Promise<LanguageModel> {
  const parts = parseModelId(id);
  if (!parts) throw new Error(`Unknown model provider in "${id}": expected one of ${Object.keys(PROVIDERS).join(', ')}, as provider:model`);
  const create = await PROVIDERS[parts.provider]();
  return create({ apiKey: apiKey(parts.provider) }).languageModel(parts.model);
}

export const inference = createInferenceService(languageModel);
