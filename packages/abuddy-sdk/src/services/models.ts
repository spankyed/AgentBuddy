// Model ids and the model catalog: plain data, loadable without the AI SDK
import type { SecretProvider } from '../types/sdk-entities.ts';

/** The providers `services.inference` runs: those the user can store a key for */
export type ProviderName = Exclude<SecretProvider, 'custom'>;

/** A model to run, as `provider:model` (e.g. `anthropic:claude-sonnet-4-5`) */
export type ModelId = `${ProviderName}:${string}`;

/*─────────────────────────────────────────────────────────────────
 * Model Catalog
 *─────────────────────────────────────────────────────────────────*/

/** Display names for the providers */
export const providerLabels: Record<ProviderName, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google',
  groq: 'Groq',
  mistral: 'Mistral',
  cohere: 'Cohere',
};

/** A catalog entry's id and provider, which its id names */
type ModelOf<P extends ProviderName> = {
  /** The id `services.inference` runs, and what an `llm` node stores */
  id: `${P}:${string}`;
  provider: P;
};

export type ModelCatalogEntry = { [P in ProviderName]: ModelOf<P> }[ProviderName] & {
  name: string;
  description?: string;
  contextWindow: number;
  maxOutput?: number;
  costPer1kInput?: number;
  costPer1kOutput?: number;
  capabilities?: string[];
};

export const availableModels: ModelCatalogEntry[] = [
  // OpenAI Models
  {
    id: 'openai:gpt-4-turbo',
    name: 'GPT-4 Turbo',
    provider: 'openai',
    description: 'Most capable GPT-4 model with vision capabilities',
    contextWindow: 128000,
    maxOutput: 4096,
    costPer1kInput: 0.01,
    costPer1kOutput: 0.03,
    capabilities: ['text', 'vision', 'function-calling'],
  },
  {
    id: 'openai:gpt-4',
    name: 'GPT-4',
    provider: 'openai',
    description: 'Advanced reasoning and complex task handling',
    contextWindow: 8192,
    maxOutput: 4096,
    costPer1kInput: 0.03,
    costPer1kOutput: 0.06,
    capabilities: ['text', 'function-calling'],
  },
  {
    id: 'openai:gpt-3.5-turbo',
    name: 'GPT-3.5 Turbo',
    provider: 'openai',
    description: 'Fast and cost-effective for most tasks',
    contextWindow: 16384,
    maxOutput: 4096,
    costPer1kInput: 0.0005,
    costPer1kOutput: 0.0015,
    capabilities: ['text', 'function-calling'],
  },
  // Anthropic Models
  {
    id: 'anthropic:claude-3-opus-20240229',
    name: 'Claude 3 Opus',
    provider: 'anthropic',
    description: 'Most capable Claude model for complex tasks',
    contextWindow: 200000,
    maxOutput: 4096,
    costPer1kInput: 0.015,
    costPer1kOutput: 0.075,
    capabilities: ['text', 'vision'],
  },
  {
    id: 'anthropic:claude-3-sonnet-20240229',
    name: 'Claude 3 Sonnet',
    provider: 'anthropic',
    description: 'Balanced performance and cost',
    contextWindow: 200000,
    maxOutput: 4096,
    costPer1kInput: 0.003,
    costPer1kOutput: 0.015,
    capabilities: ['text', 'vision'],
  },
  {
    id: 'anthropic:claude-3-haiku-20240307',
    name: 'Claude 3 Haiku',
    provider: 'anthropic',
    description: 'Fast and efficient for simple tasks',
    contextWindow: 200000,
    maxOutput: 4096,
    costPer1kInput: 0.00025,
    costPer1kOutput: 0.00125,
    capabilities: ['text', 'vision'],
  },
  // Google Models
  {
    id: 'google:gemini-pro',
    name: 'Gemini Pro',
    provider: 'google',
    description: "Google's advanced multimodal model",
    contextWindow: 32768,
    maxOutput: 8192,
    costPer1kInput: 0.00025,
    costPer1kOutput: 0.0005,
    capabilities: ['text', 'vision'],
  },
  // Mistral Models
  {
    id: 'mistral:open-mistral-7b',
    name: 'Mistral 7B',
    provider: 'mistral',
    description: 'Efficient open-weight model',
    contextWindow: 8192,
    maxOutput: 4096,
    capabilities: ['text'],
  },
];

export function getModelById(modelId: string): ModelCatalogEntry | undefined {
  return availableModels.find(model => model.id === modelId);
}

export function getModelsByProvider(provider: ProviderName): ModelCatalogEntry[] {
  return availableModels.filter(model => model.provider === provider);
}
