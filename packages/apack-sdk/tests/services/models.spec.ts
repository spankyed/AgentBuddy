// A `provider:model` id is valid when it names a provider inference runs and a model
import { describe, expect, it } from 'vitest';
import { availableModels, isModelId, parseModelId } from '../../src/services/models.ts';

describe('parseModelId', () => {
  it('splits an id at its first colon', () => {
    expect(parseModelId('groq:openai/gpt-oss-120b')).toEqual({ provider: 'groq', model: 'openai/gpt-oss-120b' });
    expect(parseModelId('anthropic:claude:odd')).toEqual({ provider: 'anthropic', model: 'claude:odd' });
  });

  it.each(['gpt-4', 'nope:model', 'anthropic:', ':claude', 'toString:x'])('rejects %s', (id) => {
    expect(parseModelId(id)).toBeUndefined();
    expect(isModelId(id)).toBe(false);
  });

  it('accepts every catalog id', () => {
    expect(availableModels.filter((entry) => !isModelId(entry.id))).toEqual([]);
  });
});
