import { streamText as aiStreamText, generateText as aiGenerateText, streamObject as aiStreamObject, generateObject as aiGenerateObject } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import type { CoreMessage } from 'ai';
import { createOpenAI } from "@ai-sdk/openai"
// import { openai } from '@ai-sdk/openai';

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY })

// Supported model providers
const providers = {
  anthropic,
  openai,
} as const;

export type Provider = keyof typeof providers;
export type ModelConfig = {
  provider: Provider;
  model: string;
};

function getModel(config: ModelConfig) {
  const provider = providers[config.provider];
  if (!provider) {
    throw new Error(`Unknown provider: ${config.provider}`);
  }
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
