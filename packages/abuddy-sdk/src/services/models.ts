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
  contextWindow?: number;
  maxOutput?: number;
  costPer1kInput?: number;
  costPer1kOutput?: number;
  capabilities?: string[];
};

export const availableModels: ModelCatalogEntry[] = [
  // Ids that track each provider's current model where one exists (undated, `-latest`), so entries age slowly
  // Anthropic
  {
    id: 'anthropic:claude-opus-5',
    name: 'Claude Opus 5',
    provider: 'anthropic',
    description: 'Most capable Claude for complex reasoning and agentic work',
    contextWindow: 1_000_000,
    maxOutput: 128_000,
    costPer1kInput: 0.005,
    costPer1kOutput: 0.025,
    capabilities: ['text', 'vision', 'function-calling'],
  },
  {
    id: 'anthropic:claude-sonnet-5',
    name: 'Claude Sonnet 5',
    provider: 'anthropic',
    description: 'Fast, capable Claude at a lower cost',
    contextWindow: 1_000_000,
    maxOutput: 128_000,
    costPer1kInput: 0.002,
    costPer1kOutput: 0.01,
    capabilities: ['text', 'vision', 'function-calling'],
  },
  {
    id: 'anthropic:claude-haiku-4-5',
    name: 'Claude Haiku 4.5',
    provider: 'anthropic',
    description: 'Fastest, lowest-cost Claude',
    contextWindow: 200_000,
    costPer1kInput: 0.001,
    costPer1kOutput: 0.005,
    capabilities: ['text', 'vision', 'function-calling'],
  },
  // OpenAI
  { id: 'openai:gpt-5.5', name: 'GPT-5.5', provider: 'openai', description: "OpenAI's flagship model", capabilities: ['text', 'vision', 'function-calling'] },
  { id: 'openai:gpt-5.4-mini', name: 'GPT-5.4 mini', provider: 'openai', description: 'Smaller, faster GPT-5.4', capabilities: ['text', 'vision', 'function-calling'] },
  // Google
  { id: 'google:gemini-pro-latest', name: 'Gemini Pro (latest)', provider: 'google', description: "Google's current Gemini Pro", capabilities: ['text', 'vision', 'function-calling'] },
  { id: 'google:gemini-flash-latest', name: 'Gemini Flash (latest)', provider: 'google', description: "Google's current Gemini Flash", capabilities: ['text', 'vision', 'function-calling'] },
  // Groq
  { id: 'groq:llama-3.3-70b-versatile', name: 'Llama 3.3 70B', provider: 'groq', description: 'Open-weight Llama on Groq', capabilities: ['text', 'function-calling'] },
  { id: 'groq:openai/gpt-oss-120b', name: 'GPT-OSS 120B', provider: 'groq', description: "OpenAI's open-weight model on Groq", capabilities: ['text', 'function-calling'] },
  // Mistral
  { id: 'mistral:mistral-large-latest', name: 'Mistral Large (latest)', provider: 'mistral', description: "Mistral's current large model", capabilities: ['text', 'function-calling'] },
  { id: 'mistral:mistral-small-latest', name: 'Mistral Small (latest)', provider: 'mistral', description: "Mistral's current small model", capabilities: ['text', 'function-calling'] },
  // Cohere
  { id: 'cohere:command-a-03-2025', name: 'Command A', provider: 'cohere', description: "Cohere's flagship model", capabilities: ['text', 'function-calling'] },
];

export function getModelById(modelId: string): ModelCatalogEntry | undefined {
  return availableModels.find(model => model.id === modelId);
}

export function getModelsByProvider(provider: ProviderName): ModelCatalogEntry[] {
  return availableModels.filter(model => model.provider === provider);
}
