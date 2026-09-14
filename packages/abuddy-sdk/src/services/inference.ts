import { streamText as aiStreamText, generateText as aiGenerateText, streamObject as aiStreamObject, generateObject as aiGenerateObject, tool as aiTool } from 'ai';
import type { LanguageModel, Schema, Tool } from 'ai';
import type { z } from 'zod';
import { getHostModule } from '../runtime/host.ts';

export type ProviderName = 'anthropic' | 'google' | 'openai' | 'groq' | 'mistral' | 'cohere';
export type Provider = ProviderName | 'openai.responses' | string;
export type ModelConfig = {
  provider: Provider;
  model: string;
  apiKey?: string;
  /** Overrides the provider's API endpoint */
  baseURL?: string;
  /** Extra request headers (OAuth-issued credentials) */
  headers?: Record<string, string>;
};

/** Options for OpenAI's built-in web search tool */
export type WebSearchToolOptions = {
  searchContextSize?: 'low' | 'medium' | 'high';
  userLocation?: { type: 'approximate'; city?: string; state?: string; country?: string };
};

/**
 * Resolves models for inference. The app registers it as host module "model-provider" (the AI SDK
 * providers with the user's API keys); unit tests register a fake (`fakeModel` from `@abuddy/sdk/testing`).
 */
export interface ModelProvider {
  languageModel(config: ModelConfig): LanguageModel;
  /** OpenAI's built-in web search tool for the Responses API */
  webSearchTool(options?: WebSearchToolOptions): Tool;
}

function modelProvider(): ModelProvider {
  return getHostModule<ModelProvider>('model-provider');
}

/** The AI SDK model a config names, from the registered model provider */
export function languageModel(config: ModelConfig): LanguageModel {
  return modelProvider().languageModel(config);
}

/** OpenAI's built-in web search tool, from the registered model provider */
export function webSearchTool(options?: WebSearchToolOptions): Tool {
  return modelProvider().webSearchTool(options);
}

/** Defines a tool the model can call (the AI SDK's `tool`) */
export const tool: typeof aiTool = aiTool;

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
  return aiStreamText({ model: languageModel(model), ...aiParams });
}

export async function generateText(params: GenerateTextOptions) {
  const { model, ...aiParams } = params;
  return aiGenerateText({ model: languageModel(model), ...aiParams });
}

export async function streamObject<T>(params: ObjectCallOptions<T>) {
  const { model, ...aiParams } = params;
  return aiStreamObject<T>({ model: languageModel(model), ...aiParams });
}

export async function generateObject<T>(params: ObjectCallOptions<T>) {
  const { model, ...aiParams } = params;
  return aiGenerateObject<T>({ model: languageModel(model), ...aiParams });
}

export type { CoreMessage } from 'ai';

// The catalog has no AI SDK dependency, so code that only lists models imports @abuddy/sdk/models
export { availableModels, getModelById, getModelsByProvider, type ModelCatalogEntry } from './models.ts';
