/**
 * Credentials provider abstraction modeled after Zed's CredentialsProvider trait.
 *
 * Two implementations:
 * - KeychainProvider: stores secrets in the OS keychain via @napi-rs/keyring
 * - FallbackProvider: stores secrets as encryptedValue in LMDB (current behavior)
 *
 * In dev mode, defaults to FallbackProvider to avoid keychain permission prompts.
 * Set AGENTBUDDY_DEV_USE_KEYCHAIN=1 to force keychain in dev.
 */

import { qx } from '@/core/ears/helpers/query';
import { tx } from '@/core/ears/helpers/transaction';
import type { EARS } from '@/core/types';

// ── Interface ────────────────────────────────────────────────────────────────

export interface CredentialsProvider {
  readonly isKeychain: boolean;
  read(entityId: EARS.EntityId, account: string): string | null;
  write(entityId: EARS.EntityId, account: string, value: string): void;
  delete(entityId: EARS.EntityId, account: string): void;
}

// ── Keychain provider (production) ───────────────────────────────────────────

const SERVICE_NAME = 'AgentBuddy';

let Entry: (new (service: string, account: string) => {
  setPassword(password: string): void;
  getPassword(): string | null;
  deleteCredential(): void;
}) | null = null;

try {
  const keyring = require('@napi-rs/keyring');
  Entry = keyring.Entry;
} catch {
  // Native module not available — will fall back below
}

class KeychainProvider implements CredentialsProvider {
  readonly isKeychain = true;

  read(_entityId: EARS.EntityId, account: string): string | null {
    const entry = new Entry!(SERVICE_NAME, account);
    try {
      return entry.getPassword();
    } catch {
      return null;
    }
  }

  write(_entityId: EARS.EntityId, account: string, value: string): void {
    const entry = new Entry!(SERVICE_NAME, account);
    entry.setPassword(value);
  }

  delete(_entityId: EARS.EntityId, account: string): void {
    const entry = new Entry!(SERVICE_NAME, account);
    try {
      entry.deleteCredential();
    } catch {
      // Ignore if not found
    }
  }
}

// ── Fallback provider (LMDB, dev mode) ──────────────────────────────────────

class FallbackProvider implements CredentialsProvider {
  readonly isKeychain = false;

  read(entityId: EARS.EntityId, _account: string): string | null {
    const result = qx(entityId).pickOne(['encryptedValue']);
    return (result as any)?.encryptedValue ?? null;
  }

  write(entityId: EARS.EntityId, _account: string, value: string): void {
    tx(entityId).put('encryptedValue', value);
  }

  delete(_entityId: EARS.EntityId, _account: string): void {
    // encryptedValue is removed when the entity is destroyed
  }
}

// ── Provider selection ───────────────────────────────────────────────────────

const isDev = process.env.NODE_ENV === 'development' || !process.env.USER_DATA_PATH;
const devUseKeychain = !!process.env.AGENTBUDDY_DEV_USE_KEYCHAIN;

function createProvider(): CredentialsProvider {
  const useKeychain = Entry !== null && (!isDev || devUseKeychain);

  if (useKeychain) {
    console.log('[Secrets] Using OS keychain for credential storage');
    return new KeychainProvider();
  }

  if (!Entry && !isDev) {
    console.warn('[Secrets] OS keychain not available, falling back to LMDB storage');
  }

  return new FallbackProvider();
}

export const credentialsProvider = createProvider();

// ── Account key helpers ──────────────────────────────────────────────────────

/** Build the keychain account key for a provider secret. */
export function secretAccount(provider: string, customName?: string): string {
  return customName ? `${provider}:${customName}` : provider;
}
