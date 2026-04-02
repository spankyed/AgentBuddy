import { streamText as aiStreamText, generateText as aiGenerateText, streamObject as aiStreamObject, generateObject as aiGenerateObject } from 'ai';
import type { CoreMessage } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { repository } from '@/repository';
import { EARS } from '@/core/types';

export type ProviderName = 'anthropic' | 'google' | 'openai' | 'groq' | 'mistral' | 'cohere';
export type Provider = ProviderName | 'openai.responses' | string; // Allow string for flexibility
export type ModelConfig = {
  provider: Provider;
  model: string;
  apiKey?: string; // Optional explicit API key
};

// Provider aliases - more maintainable structure
const PROVIDER_ALIASES: Record<ProviderName, string[]> = {
  anthropic: [],
  google: [],
  openai: ['openai.responses'],
  groq: [],
  mistral: [],
  cohere: [],
};

// Build reverse mapping for fast lookups
const ALIASES = Object.entries(PROVIDER_ALIASES).reduce((acc, [base, aliases]) => {
  aliases.forEach(alias => acc[alias] = base as ProviderName);
  return acc;
}, {} as Record<string, ProviderName>);

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
function getApiKey(providerName: string, explicitApiKey?: string): string {
  const baseProvider = (ALIASES[providerName] || providerName) as ProviderName;
  // Use explicit API key if provided
  if (explicitApiKey) return explicitApiKey;

  // Check if we're in production
  const isProd = true;
  // const isProd = process.env.NODE_ENV === 'production' && !!process.env.USER_DATA_PATH;

  if (isProd) {
    // Get API key from settings/secrets
    const settings = repository.settingsQueries.getGeneralSettings();
    const secretId = settings.secrets?.[baseProvider] as EARS.EntityId | undefined;

    if (secretId) {
      const secret = repository.secretsQueries.getSecret(secretId);
      if (secret?.encryptedValue) return secret.encryptedValue;
    }
  } else {
    // Fallback to environment variables
    const envKey = process.env[`${baseProvider.toUpperCase()}_API_KEY`];
    if (envKey) return envKey;
  }

  throw new Error(`API key not found for provider: ${baseProvider}`);
}

/**
 * Get a configured provider instance
 */
function getProvider(providerName: string, explicitApiKey?: string): any {
  const apiKey = getApiKey(providerName, explicitApiKey);

  // Special case for openai.responses
  if (providerName === 'openai.responses') {
    return (modelId: string) => createOpenAI({ apiKey }).responses(modelId);
  }

  // Regular providers
  const baseProvider = (ALIASES[providerName] || providerName) as ProviderName;
  const createFn = PROVIDER_CONFIGS[baseProvider];
  if (!createFn) throw new Error(`Unknown provider: ${providerName}`);

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
  [key: string]: any;
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
  [key: string]: any;
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
  [key: string]: any;
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
  [key: string]: any;
}) {
  const { model, ...aiParams } = params;

  return aiGenerateObject<T>({
    model: getModel(model),
    ...aiParams,
  });
}

// Re-export useful types from ai library
export type { CoreMessage } from 'ai';