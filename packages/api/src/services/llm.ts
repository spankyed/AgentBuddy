import { streamText as aiStreamText, generateText as aiGenerateText, streamObject as aiStreamObject, generateObject as aiGenerateObject } from 'ai';
import type { CoreMessage } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { repository } from '@/repository';
import { EARS } from '@/core/types';

export type ProviderName = 'anthropic' | 'google' | 'openai' | 'groq' | 'mistral' | 'cohere';
export type Provider = ProviderName;
export type ModelConfig = {
  provider: Provider;
  model: string;
  apiKey?: string; // Optional explicit API key
};

// Provider configuration map
const PROVIDER_CONFIGS = {
  anthropic: (apiKey: string) => createAnthropic({ apiKey }),
  google: (apiKey: string) => createGoogleGenerativeAI({ apiKey }),
  openai: (apiKey: string) => createOpenAI({ apiKey }),
  groq: (apiKey: string) => createOpenAI({
    apiKey,
    baseURL: 'https://api.groq.com/openai/v1'
  }),
  mistral: (apiKey: string) => createOpenAI({
    apiKey,
    baseURL: 'https://api.mistral.ai/v1'
  }),
  cohere: () => {
    throw new Error('Cohere provider not yet implemented');
  }
} as const;

/**
 * Get API key for a provider
 * Priority: explicitApiKey > production settings > env vars
 */
function getApiKey(providerName: ProviderName, explicitApiKey?: string): string {
  // Use explicit API key if provided
  if (explicitApiKey) return explicitApiKey;

  // Check if we're in production
  const isProd = process.env.NODE_ENV === 'production' && !!process.env.USER_DATA_PATH;

  if (isProd) {
    // Get API key from settings/secrets
    const settings = repository.settingsQueries.getGeneralSettings();
    const secretId = settings.secrets?.[providerName] as EARS.EntityId | undefined;

    if (secretId) {
      const secret = repository.secretsQueries.getSecret(secretId);
      if (secret?.encryptedValue) return secret.encryptedValue;
    }
  } else {
    // Fallback to environment variables
    const envKey = process.env[`${providerName.toUpperCase()}_API_KEY`];
    if (envKey) return envKey;
  }

  throw new Error(`API key not found for provider: ${providerName}`);
}

/**
 * Get a configured provider instance
 */
function getProvider(providerName: ProviderName, explicitApiKey?: string): any {
  const apiKey = getApiKey(providerName, explicitApiKey);
  const createFn = PROVIDER_CONFIGS[providerName];

  if (!createFn) {
    throw new Error(`Unknown provider: ${providerName}`);
  }

  return createFn(apiKey);
}

function getModel(config: ModelConfig) {
  const provider = getProvider(config.provider, config.apiKey);
  return provider(config.model);
}

export async function streamText(params: {
  model: ModelConfig;
  prompt?: string;
  messages?: CoreMessage[];
  system?: string;
  temperature?: number;
  maxTokens?: number;
}) {
  const { model, ...aiParams } = params;

  return aiStreamText({
    model: getModel(model),
    ...aiParams,
  });
}

export async function generateText(params: {
  model: ModelConfig;
  prompt?: string;
  messages?: CoreMessage[];
  system?: string;
  temperature?: number;
  maxTokens?: number;
}) {
  const { model, ...aiParams } = params;

  return aiGenerateText({
    model: getModel(model),
    ...aiParams,
  });
}

export async function streamObject<T>(params: {
  model: ModelConfig;
  schema: any; // Zod schema
  prompt?: string;
  messages?: CoreMessage[];
  system?: string;
  temperature?: number;
  maxTokens?: number;
}) {
  const { model, ...aiParams } = params;

  return aiStreamObject<T>({
    model: getModel(model),
    ...aiParams,
  });
}

export async function generateObject<T>(params: {
  model: ModelConfig;
  schema: any; // Zod schema
  prompt?: string;
  messages?: CoreMessage[];
  system?: string;
  temperature?: number;
  maxTokens?: number;
}) {
  const { model, ...aiParams } = params;

  return aiGenerateObject<T>({
    model: getModel(model),
    ...aiParams,
  });
}

// Re-export useful types from ai library
export type { CoreMessage } from 'ai';