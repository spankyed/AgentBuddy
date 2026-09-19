// The user's API keys, host-internal: the host and the API read and write them here. Packs reach only the metadata,
// through `services.secrets`, and never import this module.
import * as path from 'node:path';
import { resolveAppContext } from '@abuddy/sdk/env';
import { getDesignated, hasDesignation } from '@abuddy/sdk/designations';
import { _rootEvents } from '@abuddy/sdk/runtime';
import { _getSecretsFilePath } from '@abuddy/sdk/utils';
import type { SecretsSnapshot } from '@abuddy/sdk/services';
import { createSecretsStore, type SecretsStore } from './store.ts';
import { fileKeyVault, osKeyVault } from './vault.ts';
import type { PackRegistry } from '../packs/pack-registration.ts';

export { createSecretsStore } from './store.ts';
export { fileKeyVault, memoryKeyVault, KeyVaultUnavailableError, type KeyVault } from './vault.ts';

let store: SecretsStore | undefined;

/** The app's store, created on first use (paths and the environment are resolved then) */
function appStore(): SecretsStore {
  if (store) return store;
  const context = resolveAppContext();
  const filePath = _getSecretsFilePath();
  store = createSecretsStore({
    filePath,
    osVault: () => osKeyVault(context.appName),
    fileVault: () => fileKeyVault(path.join(path.dirname(filePath), 'secrets.key')),
    // Tests never touch the OS credential store; development can opt out of it too
    useFileVault: context.env === 'test' || (context.env === 'development' && process.env.ABUDDY_SECRETS_VAULT === 'file'),
  });
  return store;
}

/** The user's API keys (see `SecretsStore`) */
export const secretsStore: SecretsStore = {
  status: () => appStore().status(),
  list: () => appStore().list(),
  select: (id) => appStore().select(id),
  rename: (id, label) => appStore().rename(id, label),
  delete: (id) => appStore().delete(id),
  add: (provider, label, value) => appStore().add(provider, label, value),
  replaceValue: (id, value) => appStore().replaceValue(id, value),
  keyFor: (provider) => appStore().keyFor(provider),
  allowUnprotected: () => appStore().allowUnprotected(),
  clearAll: () => appStore().clearAll(),
  onChange: (listener) => appStore().onChange(listener),
};

/** The stored keys' metadata and their protection, as the API's procedures return them (no values) */
export function secretsSnapshot(): SecretsSnapshot {
  return { secrets: secretsStore.list(), status: secretsStore.status() };
}

/**
 * Sends the `settings` designation `SECRETS_CHANGED` (no values) on the root event bus whenever the stored keys or
 * their protection change, through the API's procedures, `services.secrets` or a failing credential store, so it
 * refreshes its plugin and key checks. The app calls it once at boot. Before a settings system is registered there's
 * none to tell (in `registry`): once it runs, it sends the current keys on CLIENT_CONNECTED. Returns the unsubscribe.
 */
export function forwardSecretsChanges(registry: Pick<PackRegistry, 'getRegisteredSystems'>): () => void {
  return secretsStore.onChange(() => {
    if (!hasDesignation('settings')) return;
    const systemId = getDesignated('settings');
    if (registry.getRegisteredSystems().has(systemId)) _rootEvents.emitIncoming({ type: 'SECRETS_CHANGED', systemId });
  });
}
