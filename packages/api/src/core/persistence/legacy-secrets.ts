// API keys stored before the host's encrypted store: plain-text Secret rows in the `ears-secrets` LMDB directory.
// They're imported into the store once, then the directory is deleted.
import * as fs from 'node:fs';
import { getLegacySecretsLmdbPath } from '@abuddy/sdk/utils';
import { secretProviderLabel, type SecretProvider } from '@abuddy/sdk/services';
import { secretsStore, KeyVaultUnavailableError, type ImportedSecret, type SecretsStore } from '@abuddy/host/secrets';
import { createLogger } from '@/core/shared/debug/logger';
import { openEnvAt } from './lmdb/envs';
import { LmdbQuery } from './lmdb/query';

const logger = createLogger('secrets');

/** The Secret rows in an old secrets directory, as keys to import (empty when it has none) */
export function readLegacySecrets(dir: string): ImportedSecret[] {
  const dbs = openEnvAt(dir);
  try {
    const query = new LmdbQuery(dbs);
    const secrets: ImportedSecret[] = [];
    for (const id of query.entitiesOfType('Secret')) {
      const provider = query.getFirstAttr('provider', id) as SecretProvider | null;
      const value = query.getFirstAttr('encryptedValue', id) as string | null;
      if (!provider || !value) continue;
      const customName = query.getFirstAttr('customName', id) as string | null;
      const updatedAt = query.getFirstAttr('updatedAt', id) as number | null;
      secrets.push({
        id,
        provider,
        label: customName || secretProviderLabel(provider),
        value,
        createdAt: (query.getFirstAttr('createdAt', id) as number | null) ?? Date.now(),
        ...(updatedAt !== null && { updatedAt }),
      });
    }
    return secrets;
  } finally {
    dbs.root.close();
  }
}

/**
 * Moves keys from the old plain-text directory into the store, then deletes the directory once every key reads back.
 * Where the OS has no credential store (until the user allows unprotected storage) the directory stays, for a later run.
 */
export function migrateLegacySecrets(dir = getLegacySecretsLmdbPath(), store: SecretsStore = secretsStore): 'none' | 'imported' | 'deferred' {
  if (!fs.existsSync(dir)) return 'none';
  const legacy = readLegacySecrets(dir);
  try {
    store.importSecrets(legacy);
  } catch (error) {
    if (!(error instanceof KeyVaultUnavailableError)) throw error;
    logger.warn('Stored API keys wait for a key store: allow unprotected storage in Settings → Secrets', { keys: legacy.length });
    return 'deferred';
  }
  const unreadable = legacy.filter((secret) => !store.canRead(secret.id));
  if (unreadable.length > 0) throw new Error(`Imported API keys don't read back (${unreadable.map((secret) => secret.id).join(', ')}); ${dir} was kept`);
  fs.rmSync(dir, { recursive: true, force: true });
  if (legacy.length > 0) logger.info('Moved stored API keys into the encrypted store', { keys: legacy.length });
  return legacy.length > 0 ? 'imported' : 'none';
}
