// Keeping API keys out of logs: key-shaped strings in text, and the values of credential fields
import { describe, expect, it } from 'vitest';
import { REDACTED, redactSecrets, redactSecretText } from '../../src/utils/redact.ts';

describe('redactSecretText', () => {
  it.each([
    ['an OpenAI key', 'key sk-proj-abcdefghij1234567890'],
    ['an Anthropic key', 'key sk-ant-api03-abcdefghij1234567890'],
    ['a Groq key', 'key gsk_abcdefghij1234567890'],
    ['a Google key', 'key AIzaabcdefghij1234567890'],
    ['a key after an underscore', 'OPENAI_KEY_sk-abcdefghij1234567890'],
    ['a key after punctuation', 'Bearer:sk-abcdefghij1234567890'],
  ])('redacts %s', (_name, text) => {
    expect(redactSecretText(text)).toContain(REDACTED);
    expect(redactSecretText(text)).not.toContain('abcdefghij');
  });

  it('leaves words that only contain a prefix, and short strings, alone', () => {
    expect(redactSecretText('task-abcdefghij1234567890')).toBe('task-abcdefghij1234567890');
    expect(redactSecretText('sk-short')).toBe('sk-short');
  });
});

describe('redactSecrets', () => {
  it("redacts credential fields whatever they hold (how prefix-less keys, like Mistral's, are caught)", () => {
    const redacted = redactSecrets({ apiKey: 'mistralkeywithnoprefix123456', nested: [{ note: 'sk-abcdefghij1234567890' }], label: 'Work' });
    expect(redacted).toEqual({ apiKey: REDACTED, nested: [{ note: REDACTED }], label: 'Work' });
  });
});
