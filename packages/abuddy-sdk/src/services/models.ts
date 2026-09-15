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

export interface ModelCatalogEntry {
  /** The id `services.inference` runs, and what an `llm` node stores; its provider is `parseModelId(id).provider` */
  id: ModelId;
  name: string;
  description?: string;
  contextWindow?: number;
  maxOutput?: number;
  costPer1kInput?: number;
  costPer1kOutput?: number;
  capabilities?: string[];
}

const TEXT_VISION_TOOLS = ['text', 'vision', 'function-calling'];
const TEXT_TOOLS = ['text', 'function-calling'];

/**
 * Ids that track each provider's current model where one exists (undated, `-latest`), so entries age slowly.
 * Context windows and prices appear only where verified.
 */
export const availableModels: ModelCatalogEntry[] = [
  { id: 'anthropic:claude-opus-5', name: 'Claude Opus 5', description: 'Most capable Claude for complex reasoning and agentic work', contextWindow: 1_000_000, maxOutput: 128_000, costPer1kInput: 0.005, costPer1kOutput: 0.025, capabilities: TEXT_VISION_TOOLS },
  { id: 'anthropic:claude-sonnet-5', name: 'Claude Sonnet 5', description: 'Fast, capable Claude at a lower cost', contextWindow: 1_000_000, maxOutput: 128_000, costPer1kInput: 0.002, costPer1kOutput: 0.01, capabilities: TEXT_VISION_TOOLS },
  { id: 'anthropic:claude-haiku-4-5', name: 'Claude Haiku 4.5', description: 'Fastest, lowest-cost Claude', contextWindow: 200_000, costPer1kInput: 0.001, costPer1kOutput: 0.005, capabilities: TEXT_VISION_TOOLS },
  { id: 'openai:gpt-5.5', name: 'GPT-5.5', description: "OpenAI's flagship model", capabilities: TEXT_VISION_TOOLS },
  { id: 'openai:gpt-5.4-mini', name: 'GPT-5.4 mini', description: 'Smaller, faster GPT-5.4', capabilities: TEXT_VISION_TOOLS },
  { id: 'google:gemini-pro-latest', name: 'Gemini Pro (latest)', description: "Google's current Gemini Pro", capabilities: TEXT_VISION_TOOLS },
  { id: 'google:gemini-flash-latest', name: 'Gemini Flash (latest)', description: "Google's current Gemini Flash", capabilities: TEXT_VISION_TOOLS },
  { id: 'groq:llama-3.3-70b-versatile', name: 'Llama 3.3 70B', description: 'Open-weight Llama on Groq', capabilities: TEXT_TOOLS },
  { id: 'groq:openai/gpt-oss-120b', name: 'GPT-OSS 120B', description: "OpenAI's open-weight model on Groq", capabilities: TEXT_TOOLS },
  { id: 'mistral:mistral-large-latest', name: 'Mistral Large (latest)', description: "Mistral's current large model", capabilities: TEXT_TOOLS },
  { id: 'mistral:mistral-small-latest', name: 'Mistral Small (latest)', description: "Mistral's current small model", capabilities: TEXT_TOOLS },
  { id: 'cohere:command-a-03-2025', name: 'Command A', description: "Cohere's flagship model", capabilities: TEXT_TOOLS },
];

/** A `provider:model` id's parts, or undefined when it doesn't name a provider and a model */
export function parseModelId(id: string): { provider: ProviderName; model: string } | undefined {
  const separator = id.indexOf(':');
  const provider = id.slice(0, separator) as ProviderName;
  const model = id.slice(separator + 1);
  return separator > 0 && model && Object.keys(providerLabels).includes(provider) ? { provider, model } : undefined;
}

export const isModelId = (id: string): id is ModelId => parseModelId(id) !== undefined;
