// The app's model provider (host module "model-provider"): AI SDK providers with the user's API keys
// from settings, or *_API_KEY environment variables.
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI, openai } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';
import type { ModelConfig, ModelProvider, ProviderName } from '@abuddy/sdk/inference';
import { settingsRepository } from '@/core/settings-repository';

const PROVIDER_ALIASES: Record<string, ProviderName> = {
  'openai.responses': 'openai',
};

function resolveProvider(provider: string): ProviderName {
  return (PROVIDER_ALIASES[provider] || provider) as ProviderName;
}

function apiKeyFor(provider: ProviderName): string {
  try {
    const secretId = settingsRepository.settingsQueries.getGeneralSettings().secrets?.[provider];
    if (secretId) {
      const secret = settingsRepository.secretsQueries.getSecret(secretId);
      if (secret?.encryptedValue) return secret.encryptedValue;
    }
  } catch { /* settings not available — fall through to env */ }

  const envKey = process.env[`${provider.toUpperCase()}_API_KEY`];
  if (envKey) return envKey;

  throw new Error(`API key not found for provider: ${provider}`);
}

type ProviderOptions = { apiKey: string; baseURL?: string; headers?: Record<string, string> };

const PROVIDERS: Record<ProviderName, (options: ProviderOptions) => (modelId: string) => LanguageModel> = {
  anthropic: (options) => createAnthropic(options),
  // @ai-sdk/google 2.x types its models for a newer AI SDK spec than ai 4 names; the app used it this way before
  google: (options) => createGoogleGenerativeAI(options) as unknown as (modelId: string) => LanguageModel,
  openai: (options) => createOpenAI(options),
  groq: (options) => createOpenAI({ baseURL: 'https://api.groq.com/openai/v1', ...options }),
  mistral: (options) => createOpenAI({ baseURL: 'https://api.mistral.ai/v1', ...options }),
  cohere: () => { throw new Error('Cohere provider not yet implemented'); },
};

export const modelProvider: ModelProvider = {
  languageModel(config: ModelConfig): LanguageModel {
    const base = resolveProvider(config.provider);
    const options: ProviderOptions = {
      apiKey: config.apiKey ?? apiKeyFor(base),
      ...(config.baseURL && { baseURL: config.baseURL }),
      ...(config.headers && { headers: config.headers }),
    };
    if (config.provider === 'openai.responses') return createOpenAI(options).responses(config.model);
    const create = PROVIDERS[base];
    if (!create) throw new Error(`Unknown provider: ${config.provider}`);
    return create(options)(config.model);
  },
  webSearchTool: (options) => openai.tools.webSearchPreview(options ?? {}),
};
