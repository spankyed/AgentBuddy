import { streamText as aiStreamText, generateText as aiGenerateText, streamObject as aiStreamObject, generateObject as aiGenerateObject } from 'ai';
import type { CoreMessage } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { getHostModule } from '../runtime/host';
import type { EARS } from '../types/entities';

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

let _repoMod: any;
function repoMod() { if (!_repoMod) _repoMod = getHostModule('repository'); return _repoMod; }

function getApiKeyFromStore(baseProvider: ProviderName): string {
  try {
    const settings = repoMod().settingsQueries.getGeneralSettings();
    const secretId = settings.secrets?.[baseProvider] as EARS.EntityId | undefined;
    if (secretId) {
      const secret = repoMod().secretsQueries.getSecret(secretId);
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

function getProvider(providerName: string, explicitApiKey?: string): any {
  const apiKey = getApiKey(providerName, explicitApiKey);

  if (providerName === 'openai.responses') {
    return (modelId: string) => createOpenAI({ apiKey }).responses(modelId);
  }

  const baseProvider = resolveProvider(providerName);
  const createFn = PROVIDER_CONFIGS[baseProvider];
  if (!createFn) throw new Error(`Unknown provider: ${providerName}`);

  return createFn(apiKey);
}

function getModel(config: ModelConfig) {
  return getProvider(config.provider, config.apiKey)(config.model);
}

export async function streamText(params: {
  model: ModelConfig;
  prompt?: string;
  messages?: CoreMessage[];
  system?: string;
  temperature?: number;
  maxTokens?: number;
  [key: string]: any;
}) {
  const { model, ...aiParams } = params;
  return aiStreamText({ model: getModel(model), ...aiParams });
}

export async function generateText(params: {
  model: ModelConfig;
  prompt?: string;
  messages?: CoreMessage[];
  system?: string;
  temperature?: number;
  maxTokens?: number;
  [key: string]: any;
}) {
  const { model, ...aiParams } = params;
  return aiGenerateText({ model: getModel(model), ...aiParams });
}

export async function streamObject<T>(params: {
  model: ModelConfig;
  schema: any;
  prompt?: string;
  messages?: CoreMessage[];
  system?: string;
  temperature?: number;
  maxTokens?: number;
  [key: string]: any;
}) {
  const { model, ...aiParams } = params;
  return aiStreamObject<T>({ model: getModel(model), ...aiParams });
}

export async function generateObject<T>(params: {
  model: ModelConfig;
  schema: any;
  prompt?: string;
  messages?: CoreMessage[];
  system?: string;
  temperature?: number;
  maxTokens?: number;
  [key: string]: any;
}) {
  const { model, ...aiParams } = params;
  return aiGenerateObject<T>({ model: getModel(model), ...aiParams });
}

export type { CoreMessage } from 'ai';
