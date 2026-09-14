// The app's model provider (host module "model-provider") builds the AI SDK models inference uses
import { describe, expect, it } from 'vitest';
import { modelProvider } from '@/core/inference/model-provider';

describe('the app model provider', () => {
  it.each([
    [{ provider: 'anthropic', model: 'claude-3-haiku' }, 'anthropic.messages'],
    [{ provider: 'openai', model: 'gpt-4o-mini' }, 'openai.chat'],
    [{ provider: 'openai.responses', model: 'gpt-4o-mini' }, 'openai.responses'],
    [{ provider: 'groq', model: 'llama' }, 'openai.chat'],
  ])('builds %o as a %s model with the given key, without calling it', (config, provider) => {
    const model = modelProvider.languageModel({ ...config, apiKey: 'test-key' }) as { provider: string; modelId: string };
    expect(model.provider).toBe(provider);
    expect(model.modelId).toBe(config.model);
  });

  it('builds OpenAI web search as a provider-defined tool', () => {
    expect(modelProvider.webSearchTool({ searchContextSize: 'low' })).toMatchObject({ type: 'provider-defined', id: 'openai.web_search_preview' });
  });

  it('rejects an unknown provider', () => {
    expect(() => modelProvider.languageModel({ provider: 'nope', model: 'x', apiKey: 'k' })).toThrow('Unknown provider: nope');
  });
});
