// The rules every store of the user's keys keeps: the host's encrypted store and the test host's in-memory one.
// Pure functions over key metadata; each returns the next list.
import type { SecretInfo, SecretProvider } from './secrets.ts';
import { providerLabels, type ProviderName } from './models.ts';

/** @internal A provider's display name, for messages and default labels */
export const secretProviderLabel = (provider: SecretProvider): string =>
  provider === 'custom' ? 'Custom' : providerLabels[provider as ProviderName];

function find<T extends SecretInfo>(secrets: readonly T[], id: string): T {
  const secret = secrets.find((candidate) => candidate.id === id);
  if (!secret) throw new Error(`No stored key "${id}"`);
  return secret;
}

function checkLabel(secrets: readonly SecretInfo[], provider: SecretProvider, label: string, exceptId?: string): string {
  const trimmed = label.trim();
  if (!trimmed) throw new Error('A key needs a label');
  const taken = secrets.some((secret) => secret.id !== exceptId && secret.provider === provider && secret.label.toLowerCase() === trimmed.toLowerCase());
  if (taken) throw new Error(`${secretProviderLabel(provider)} already has a key labelled "${trimmed}"`);
  return trimmed;
}

/** @internal */
export const secretRules = {
  /** Adds a key; a provider's first key is selected */
  add<T extends SecretInfo>(secrets: readonly T[], secret: Omit<T, 'selected' | 'label'> & { label: string }): T[] {
    const label = checkLabel(secrets, secret.provider, secret.label);
    const selected = !secrets.some((existing) => existing.provider === secret.provider);
    return [...secrets, { ...secret, label, selected } as T];
  },

  /** Selects a key, and unselects its provider's others, in one change */
  select<T extends SecretInfo>(secrets: readonly T[], id: string, now: number): T[] {
    const { provider } = find(secrets, id);
    return secrets.map((secret) => secret.provider !== provider
      ? secret
      : secret.id === id
        ? { ...secret, selected: true, ...(!secret.selected && { updatedAt: now }) }
        : secret.selected ? { ...secret, selected: false, updatedAt: now } : secret);
  },

  rename<T extends SecretInfo>(secrets: readonly T[], id: string, label: string, now: number): T[] {
    const secret = find(secrets, id);
    const next = checkLabel(secrets, secret.provider, label, id);
    return secrets.map((candidate) => candidate.id === id ? { ...candidate, label: next, updatedAt: now } : candidate);
  },

  /** Removes a key; removing the selected key leaves its provider with none selected */
  remove<T extends SecretInfo>(secrets: readonly T[], id: string): T[] {
    find(secrets, id);
    return secrets.filter((secret) => secret.id !== id);
  },

  /** The key a provider uses, or why there's none, naming the fix */
  selectedFor<T extends SecretInfo>(secrets: readonly T[], provider: ProviderName): T {
    const keys = secrets.filter((secret) => secret.provider === provider);
    const label = secretProviderLabel(provider);
    if (keys.length === 0) throw new Error(`No ${label} key: add one in Settings → Secrets`);
    const selected = keys.find((secret) => secret.selected);
    if (!selected) throw new Error(`No ${label} key selected (${keys.map((secret) => secret.label).join(', ')}): choose one in Settings → Secrets`);
    return selected;
  },
};

/** @internal A key's metadata, copied out of a store's record */
export const toSecretInfo = ({ id, provider, label, selected, createdAt, updatedAt }: SecretInfo): SecretInfo =>
  ({ id, provider, label, selected, createdAt, ...(updatedAt !== undefined && { updatedAt }) });
