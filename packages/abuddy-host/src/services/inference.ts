// services.inference: AI SDK 7 calls on the provider a `provider:model` id names, with the user's key
// for that provider.
import { createAnthropic } from '@ai-sdk/anthropic';
import { createCohere } from '@ai-sdk/cohere';
import { createGoogle } from '@ai-sdk/google';
import { createGroq } from '@ai-sdk/groq';
import { createMistral } from '@ai-sdk/mistral';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, streamText, type LanguageModel } from 'ai';
import { toAiOutput, type InferenceService, type ModelId, type ProviderName } from '@abuddy/sdk/services';
import { settingsRepository } from '../settings/index.ts';

const PROVIDERS = {
  anthropic: createAnthropic,
  openai: createOpenAI,
  google: createGoogle,
  groq: createGroq,
  mistral: createMistral,
  cohere: createCohere,
} satisfies Record<ProviderName, (options: { apiKey: string }) => { languageModel(modelId: string): LanguageModel }>;

/** The user's key for a provider: Settings → Secrets, else `<PROVIDER>_API_KEY` */
function apiKey(provider: ProviderName): string {
  const secretId = settingsRepository.settingsQueries.getGeneralSettings().secrets?.[provider];
  const stored = secretId ? settingsRepository.secretsQueries.getSecret(secretId)?.encryptedValue : undefined;
  const key = stored || process.env[`${provider.toUpperCase()}_API_KEY`];
  if (!key) throw new Error(`No API key for ${provider}: add one in Settings → Secrets, or set ${provider.toUpperCase()}_API_KEY`);
  return key;
}

/** The AI SDK model an id names, built with the provider's current key */
export function languageModel(id: ModelId): LanguageModel {
  const separator = id.indexOf(':');
  const provider = id.slice(0, separator);
  if (separator < 1 || !Object.hasOwn(PROVIDERS, provider)) {
    throw new Error(`Unknown model provider in "${id}": expected one of ${Object.keys(PROVIDERS).join(', ')}, as provider:model`);
  }
  const name = provider as ProviderName;
  return PROVIDERS[name]({ apiKey: apiKey(name) }).languageModel(id.slice(separator + 1));
}

export const inference: InferenceService = {
  generateText: async ({ model, output, ...options }) =>
    generateText({ ...options, output: await toAiOutput(output), model: languageModel(model) } as Parameters<typeof generateText>[0]) as never,
  streamText: async ({ model, output, ...options }) =>
    streamText({ ...options, output: await toAiOutput(output), model: languageModel(model) } as Parameters<typeof streamText>[0]) as never,
};
