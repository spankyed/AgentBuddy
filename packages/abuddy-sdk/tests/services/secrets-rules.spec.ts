// The rules for the user's keys: several labelled keys per provider, at most one selected
import { describe, expect, it } from 'vitest';
import { secretRules } from '../../src/services/secrets-rules.ts';
import type { SecretInfo } from '../../src/services/secrets.ts';

const add = (secrets: SecretInfo[], id: string, provider: SecretInfo['provider'], label: string) =>
  secretRules.add(secrets, { id, provider, label, createdAt: 1 });
const selected = (secrets: SecretInfo[]) => secrets.filter((secret) => secret.selected).map((secret) => secret.id);

describe('secret rules', () => {
  it("selects a provider's first key, and not the ones added after it", () => {
    let secrets = add([], 'a', 'openai', 'Work');
    secrets = add(secrets, 'b', 'openai', 'Personal');
    secrets = add(secrets, 'c', 'anthropic', 'Work');
    expect(selected(secrets)).toEqual(['a', 'c']);
  });

  it("selects one key and unselects its provider's others, leaving other providers alone", () => {
    let secrets = add(add(add([], 'a', 'openai', 'Work'), 'b', 'openai', 'Personal'), 'c', 'anthropic', 'Work');
    secrets = secretRules.select(secrets, 'b', 5);
    expect(selected(secrets)).toEqual(['b', 'c']);
    expect(secrets.find((secret) => secret.id === 'a')?.updatedAt).toBe(5);
    expect(secrets.find((secret) => secret.id === 'c')?.updatedAt).toBeUndefined();
  });

  it('keeps labels unique per provider, ignoring case and spaces, and allows the same label elsewhere', () => {
    const secrets = add([], 'a', 'openai', 'Work');
    expect(() => add(secrets, 'b', 'openai', ' work ')).toThrow('OpenAI already has a key labelled "work"');
    expect(() => add(secrets, 'b', 'openai', '  ')).toThrow('A key needs a label');
    expect(add(secrets, 'b', 'anthropic', 'Work')).toHaveLength(2);
    expect(() => secretRules.rename(add(secrets, 'b', 'openai', 'Personal'), 'b', 'WORK', 2)).toThrow('already has a key labelled');
    expect(secretRules.rename(secrets, 'a', 'Work', 2)[0].label).toBe('Work');
  });

  it('leaves a provider with no key selected when its selected key is removed', () => {
    const secrets = secretRules.remove(add(add([], 'a', 'openai', 'Work'), 'b', 'openai', 'Personal'), 'a');
    expect(selected(secrets)).toEqual([]);
    expect(() => secretRules.remove(secrets, 'missing')).toThrow('No stored key "missing"');
  });

  it('names the fix when a provider has no key, or none selected', () => {
    expect(() => secretRules.selectedFor([], 'openai')).toThrow('No OpenAI key: add one in Settings → Secrets');
    const unselected = secretRules.remove(add(add(add([], 'a', 'openai', 'Work'), 'b', 'openai', 'Personal'), 'c', 'openai', 'Team'), 'a');
    expect(() => secretRules.selectedFor(unselected, 'openai')).toThrow('No OpenAI key selected (Personal, Team): choose one in Settings → Secrets');
    expect(secretRules.selectedFor(secretRules.select(unselected, 'c', 3), 'openai').id).toBe('c');
  });

  it('keeps custom keys by the same rules', () => {
    let secrets = add(add([], 'a', 'custom', 'GitHub'), 'b', 'custom', 'Linear');
    expect(selected(secrets)).toEqual(['a']);
    secrets = secretRules.select(secrets, 'b', 4);
    expect(selected(secrets)).toEqual(['b']);
  });
});
