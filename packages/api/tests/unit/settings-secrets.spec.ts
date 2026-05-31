import { describe, expect, it } from 'vitest';
import { mergeSecretReferences } from '@/systems/settings/secrets/merge-secret-settings';

describe('settings secret references', () => {
  it('preserves provider metadata while refreshing API key references', () => {
    const merged = mergeSecretReferences(
      {
        google: 'Secret-old-google',
        anthropic: null,
        openai: null,
        groq: null,
        mistral: null,
        cohere: null,
        custom: { stale: 'Secret-stale' },
        required: ['openai', 'anthropic'],
        cliPaths: {
          codex: '/opt/homebrew/bin/codex',
          'claude-code': '/Users/me/.local/bin/claude',
        },
      },
      [
        {
          id: 'Secret-openai',
          provider: 'openai',
          createdAt: 1,
        },
        {
          id: 'Secret-custom',
          provider: 'custom',
          customName: 'local-llm',
          createdAt: 2,
        },
      ],
    );

    expect(merged.openai).toBe('Secret-openai');
    expect(merged.google).toBeNull();
    expect(merged.custom).toEqual({ 'local-llm': 'Secret-custom' });
    expect(merged.required).toEqual(['openai', 'anthropic']);
    expect(merged.cliPaths).toEqual({
      codex: '/opt/homebrew/bin/codex',
      'claude-code': '/Users/me/.local/bin/claude',
    });
  });
});
