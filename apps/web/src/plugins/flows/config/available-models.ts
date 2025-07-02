import type { ModelConfig } from '@abuddy/api';

export const availableModels: ModelConfig[] = [
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
    capabilities: ['text', 'vision', 'function-calling']
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
    capabilities: ['text', 'function-calling']
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
    capabilities: ['text', 'function-calling']
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
    capabilities: ['text', 'vision']
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
    capabilities: ['text', 'vision']
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
    capabilities: ['text', 'vision']
  },

  // Google Models
  {
    id: 'gemini-pro',
    name: 'Gemini Pro',
    provider: 'Google',
    description: 'Google\'s advanced multimodal model',
    contextWindow: 32768,
    maxOutput: 8192,
    costPer1kInput: 0.00025,
    costPer1kOutput: 0.0005,
    capabilities: ['text', 'vision']
  },

  // Local/Open Models
  {
    id: 'llama-2-70b',
    name: 'Llama 2 70B',
    provider: 'Meta',
    description: 'Open-source model for local deployment',
    contextWindow: 4096,
    maxOutput: 2048,
    capabilities: ['text']
  },
  {
    id: 'mistral-7b',
    name: 'Mistral 7B',
    provider: 'Mistral AI',
    description: 'Efficient open-source model',
    contextWindow: 8192,
    maxOutput: 4096,
    capabilities: ['text']
  }
];