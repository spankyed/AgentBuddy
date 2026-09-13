import { streamText as aiStreamText, generateText as aiGenerateText, streamObject as aiStreamObject, generateObject as aiGenerateObject } from 'ai';
import type { CoreMessage } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { repository } from '../ears/repository.ts';
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
    const settings = repository.settingsQueries.getGeneralSettings();
    const secretId = settings.secrets?.[baseProvider] as EARS.EntityId | undefined;
    if (secretId) {
      const secret = repository.secretsQueries.getSecret(secretId);
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

/*─────────────────────────────────────────────────────────────────
 * Model Catalog
 *─────────────────────────────────────────────────────────────────*/

export interface ModelCatalogEntry {
  id: string;
  name: string;
  provider: string;
  description?: string;
  contextWindow: number;
  maxOutput?: number;
  costPer1kInput?: number;
  costPer1kOutput?: number;
  capabilities?: string[];
}

export const availableModels: ModelCatalogEntry[] = [
  // OpenAI Models
  {
    id: 'gpt-4-turbo',
    name: 'GPT-4 Turbo',
    provider: 'OpenAI',
    description: 'Most capable GPT-4 model with vision capabilities',
    contextWindow: 128000,
    maxOutput: 4096,
    costPer1kInput: 0.01,
    costPer1kOutput: 0.03,
    capabilities: ['text', 'vision', 'function-calling'],
  },
  {
    id: 'gpt-4',
    name: 'GPT-4',
    provider: 'OpenAI',
    description: 'Advanced reasoning and complex task handling',
    contextWindow: 8192,
    maxOutput: 4096,
    costPer1kInput: 0.03,
    costPer1kOutput: 0.06,
    capabilities: ['text', 'function-calling'],
  },
  {
    id: 'gpt-3.5-turbo',
    name: 'GPT-3.5 Turbo',
    provider: 'OpenAI',
    description: 'Fast and cost-effective for most tasks',
    contextWindow: 16384,
    maxOutput: 4096,
    costPer1kInput: 0.0005,
    costPer1kOutput: 0.0015,
    capabilities: ['text', 'function-calling'],
  },
  // Anthropic Models
  {
    id: 'claude-3-opus',
    name: 'Claude 3 Opus',
    provider: 'Anthropic',
    description: 'Most capable Claude model for complex tasks',
    contextWindow: 200000,
    maxOutput: 4096,
    costPer1kInput: 0.015,
    costPer1kOutput: 0.075,
    capabilities: ['text', 'vision'],
  },
  {
    id: 'claude-3-sonnet',
    name: 'Claude 3 Sonnet',
    provider: 'Anthropic',
    description: 'Balanced performance and cost',
    contextWindow: 200000,
    maxOutput: 4096,
    costPer1kInput: 0.003,
    costPer1kOutput: 0.015,
    capabilities: ['text', 'vision'],
  },
  {
    id: 'claude-3-haiku',
    name: 'Claude 3 Haiku',
    provider: 'Anthropic',
    description: 'Fast and efficient for simple tasks',
    contextWindow: 200000,
    maxOutput: 4096,
    costPer1kInput: 0.00025,
    costPer1kOutput: 0.00125,
    capabilities: ['text', 'vision'],
  },
  // Google Models
  {
    id: 'gemini-pro',
    name: 'Gemini Pro',
    provider: 'Google',
    description: "Google's advanced multimodal model",
    contextWindow: 32768,
    maxOutput: 8192,
    costPer1kInput: 0.00025,
    costPer1kOutput: 0.0005,
    capabilities: ['text', 'vision'],
  },
  // Local/Open Models
  {
    id: 'llama-2-70b',
    name: 'Llama 2 70B',
    provider: 'Meta',
    description: 'Open-source model for local deployment',
    contextWindow: 4096,
    maxOutput: 2048,
    capabilities: ['text'],
  },
  {
    id: 'mistral-7b',
    name: 'Mistral 7B',
    provider: 'Mistral AI',
    description: 'Efficient open-source model',
    contextWindow: 8192,
    maxOutput: 4096,
    capabilities: ['text'],
  },
];

export function getModelById(modelId: string): ModelCatalogEntry | undefined {
  return availableModels.find(model => model.id === modelId);
}

export function getModelsByProvider(provider: string): ModelCatalogEntry[] {
  return availableModels.filter(model => model.provider === provider);
}
