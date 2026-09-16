import { hostService } from './host-services.ts';
import type { ProviderName } from './models.ts';

/** Whom a stored key is for: a model provider, or `custom` for keys the app's own integrations name */
export type SecretProvider = ProviderName | 'custom';

/** A stored key, without its value: packs and the frontend never receive values */
export interface SecretInfo {
  id: string;
  provider: SecretProvider;
  /** Names the account, e.g. "Work"; unique per provider */
  label: string;
  /** The key `services.inference` uses for the provider; at most one per provider */
  selected: boolean;
  createdAt: number;
  updatedAt?: number;
}

/**
 * How stored keys are protected on this system:
 * - `os-keystore`: encrypted, with the data key in the OS credential store (`backend` names it)
 * - `unprotected`: encrypted with a data key kept in a file next to them, after the user chose to
 * - `unavailable`: the OS credential store failed its last use (none on this system, or locked); adding a key
 *   tries it again, and the user can allow unprotected storage instead
 */
export type SecretsProtection = 'os-keystore' | 'unprotected' | 'unavailable';

export interface SecretsStatus {
  protection: SecretsProtection;
  /** The store holding the data key, e.g. "macOS Keychain" */
  backend: string;
}

/**
 * The user's API keys, as metadata: list, select, rename and delete them. Adding a key or replacing its value
 * happens only in Settings → Secrets (the host's `secrets` procedures), so no value passes through packs or events.
 * The host implements it.
 */
export interface SecretsService {
  status(): SecretsStatus;
  /** Every stored key, without values */
  list(): SecretInfo[];
  /** Makes the key the one its provider uses, and its provider's other keys not */
  select(id: string): void;
  rename(id: string, label: string): void;
  /** Deleting the selected key leaves its provider with none selected */
  delete(id: string): void;
}

/** The host's implementation, registered under `secrets` */
export const secrets: SecretsService = {
  status: () => hostService('secrets').status(),
  list: () => hostService('secrets').list(),
  select: (id) => hostService('secrets').select(id),
  rename: (id, label) => hostService('secrets').rename(id, label),
  delete: (id) => hostService('secrets').delete(id),
};
