import { streamText as aiStreamText, generateText as aiGenerateText, streamObject as aiStreamObject, generateObject as aiGenerateObject } from 'ai';
import type { LanguageModel, Schema } from 'ai';
import type { z } from 'zod';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { builtinRepository } from '../ears/builtin-repositories.ts';
import type { EARS } from '../types/entities.ts';

export type ProviderName = 'anthropic' | 'google' | 'openai' | 'groq' | 'mistral' | 'cohere';
export type Provider = ProviderName | 'openai.responses' | string;
export type ModelConfig = {
  provider: Provider;
  model: string;
  apiKey?: string;
};

const PROVIDER_ALIASES: Record<string, ProviderName> = {
  'openai.responses': 'openai',
};

export function resolveProvider(provider: string): ProviderName {
  return (PROVIDER_ALIASES[provider] || provider) as ProviderName;
}

function getApiKeyFromStore(baseProvider: ProviderName): string {
  try {
    const settings = builtinRepository.settingsQueries.getGeneralSettings();
    const secretId = settings.secrets?.[baseProvider] as EARS.EntityId | undefined;
    if (secretId) {
      const secret = builtinRepository.secretsQueries.getSecret(secretId);
      if (secret?.encryptedValue) return secret.encryptedValue;
    }
  } catch { /* settings not available — fall through to env */ }

  const envKey = process.env[`${baseProvider.toUpperCase()}_API_KEY`];
  if (envKey) return envKey;

  throw new Error(`API key not found for provider: ${baseProvider}`);
}

export function getApiKey(providerName: string, explicitApiKey?: string): string {
  if (explicitApiKey) return explicitApiKey;
  return getApiKeyFromStore(resolveProvider(providerName));
}

const PROVIDER_CONFIGS = {
  anthropic: (apiKey: string) => createAnthropic({ apiKey }),
  google: (apiKey: string) => createGoogleGenerativeAI({ apiKey }),
  openai: (apiKey: string) => createOpenAI({ apiKey }),
  groq: (apiKey: string) => createOpenAI({ apiKey, baseURL: 'https://api.groq.com/openai/v1' }),
  mistral: (apiKey: string) => createOpenAI({ apiKey, baseURL: 'https://api.mistral.ai/v1' }),
  cohere: () => { throw new Error('Cohere provider not yet implemented'); },
} as const;

function getProvider(providerName: string, explicitApiKey?: string): (modelId: string) => LanguageModel {
  const apiKey = getApiKey(providerName, explicitApiKey);

  if (providerName === 'openai.responses') {
    return (modelId: string) => createOpenAI({ apiKey }).responses(modelId);
  }

  const baseProvider = resolveProvider(providerName);
  const createFn = PROVIDER_CONFIGS[baseProvider];
  if (!createFn) throw new Error(`Unknown provider: ${providerName}`);

  return createFn(apiKey) as (modelId: string) => LanguageModel;
}

function getModel(config: ModelConfig) {
  return getProvider(config.provider, config.apiKey)(config.model);
}

type TextCallOptions = Omit<Parameters<typeof aiGenerateText>[0], 'model'>;

/** The AI SDK's options, with the model named by provider and id */
export type GenerateTextOptions = TextCallOptions & { model: ModelConfig };
export type StreamTextOptions = Omit<Parameters<typeof aiStreamText>[0], 'model'> & { model: ModelConfig };
export type ObjectCallOptions<T> = Pick<TextCallOptions,
  | 'system' | 'prompt' | 'messages' | 'maxTokens' | 'temperature' | 'topP' | 'topK' | 'presencePenalty'
  | 'frequencyPenalty' | 'seed' | 'maxRetries' | 'abortSignal' | 'headers' | 'providerOptions' | 'experimental_telemetry'
> & {
  model: ModelConfig;
  schema: z.Schema<T, z.ZodTypeDef, unknown> | Schema<T>;
  schemaName?: string;
  schemaDescription?: string;
  mode?: 'auto' | 'json' | 'tool';
};

export async function streamText(params: StreamTextOptions) {
  const { model, ...aiParams } = params;
  return aiStreamText({ model: getModel(model), ...aiParams });
}

export async function generateText(params: GenerateTextOptions) {
  const { model, ...aiParams } = params;
  return aiGenerateText({ model: getModel(model), ...aiParams });
}

export async function streamObject<T>(params: ObjectCallOptions<T>) {
  const { model, ...aiParams } = params;
  return aiStreamObject<T>({ model: getModel(model), ...aiParams });
}

export async function generateObject<T>(params: ObjectCallOptions<T>) {
  const { model, ...aiParams } = params;
  return aiGenerateObject<T>({ model: getModel(model), ...aiParams });
}

export type { CoreMessage } from 'ai';

// The catalog has no AI SDK dependency, so code that only lists models imports @abuddy/sdk/models
export { availableModels, getModelById, getModelsByProvider, type ModelCatalogEntry } from './models.ts';
