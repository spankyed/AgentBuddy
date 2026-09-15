// The user's API keys, host-internal: the host and the API read and write them here. Packs reach only the metadata,
// through `services.secrets`; this module isn't a registered host module.
import * as path from 'node:path';
import { resolveAppContext } from '@abuddy/sdk/env';
import { getSecretsFilePath } from '@abuddy/sdk/utils';
import { createSecretsStore, type SecretsStore } from './store.ts';
import { fileKeyVault, osKeyVault } from './vault.ts';

export { createSecretsStore, type SecretsStore, type SecretsStoreOptions } from './store.ts';
export { fileKeyVault, memoryKeyVault, osKeyVault, KeyVaultUnavailableError, type KeyVault } from './vault.ts';

let store: SecretsStore | undefined;

/** The app's store, created on first use (paths and the environment are resolved then) */
function appStore(): SecretsStore {
  if (store) return store;
  const context = resolveAppContext();
  const filePath = getSecretsFilePath();
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
};
