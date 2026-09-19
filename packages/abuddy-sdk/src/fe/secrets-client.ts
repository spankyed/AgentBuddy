import { boundFeHost } from '../runtime/fe-host.ts';
import type { SecretProvider, SecretsSnapshot } from '../services/secrets.ts';

export type { SecretsSnapshot };

/**
 * The user's API keys, for a settings page. Values go in through `add` and `replaceValue` only, over the API
 * client and off the event bus, so they reach no log, event or listener; nothing returns one. Each call
 * resolves with the stored keys (without values) and how they're protected. The renderer binds it as `secrets` with
 * `bindFeHost`; nothing else of the API client reaches the SDK.
 */
export interface SecretsClient {
  list(): Promise<SecretsSnapshot>;
  add(provider: SecretProvider, label: string, value: string): Promise<SecretsSnapshot>;
  replaceValue(id: string, value: string): Promise<SecretsSnapshot>;
  select(id: string): Promise<SecretsSnapshot>;
  rename(id: string, label: string): Promise<SecretsSnapshot>;
  delete(id: string): Promise<SecretsSnapshot>;
  /** Where there's no OS credential store: store keys with a data key kept in a file, as the user chose */
  allowUnprotected(): Promise<SecretsSnapshot>;
}

const host = (): SecretsClient => boundFeHost().secrets;

export const secretsClient: SecretsClient = {
  list: () => host().list(),
  add: (provider, label, value) => host().add(provider, label, value),
  replaceValue: (id, value) => host().replaceValue(id, value),
  select: (id) => host().select(id),
  rename: (id, label) => host().rename(id, label),
  delete: (id) => host().delete(id),
  allowUnprotected: () => host().allowUnprotected(),
};
