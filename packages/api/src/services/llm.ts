import { streamText as aiStreamText, generateText as aiGenerateText, streamObject as aiStreamObject, generateObject as aiGenerateObject } from 'ai';
import type { CoreMessage } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { getApiKey, resolveProvider, type ProviderName } from './api-keys';

export type { ProviderName } from './api-keys';
export type Provider = ProviderName | 'openai.responses' | string;
export type ModelConfig = {
  provider: Provider;
  model: string;
  apiKey?: string;
};

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