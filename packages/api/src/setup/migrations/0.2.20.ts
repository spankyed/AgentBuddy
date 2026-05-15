import { EARS } from '@/core/types';
import { qx } from '@/core/ears/helpers/query';
import { tx } from '@/core/ears/helpers/transaction';
import { credentialsProvider, secretAccount } from '@/systems/settings/secrets/credentials-provider';
import type { Migration } from './index';

export const migration: Migration = {
  target: '0.2.20',
  description: 'Migrate secret values from LMDB to OS keychain',
  up: () => {
    // Only migrate if we're using the keychain provider.
    // If falling back to LMDB, secrets are already in the right place.
    if (!credentialsProvider.isKeychain) return;

    const secrets = qx(EARS.Entity.Secret).pickAll() as any[];
    let migrated = 0;

    for (const secret of secrets) {
      // Idempotent: skip if encryptedValue is already absent from LMDB
      if (!secret.encryptedValue) continue;

      const account = secretAccount(secret.provider, secret.customName);
      credentialsProvider.write(secret.id, account, secret.encryptedValue);

      // Remove the plaintext value from LMDB
      tx(secret.id as EARS.EntityId).drop(EARS.AttrKind.Custom('encryptedValue'));
      migrated++;
    }

    if (migrated > 0) {
      console.log(`[migration] Migrated ${migrated} secret(s) from LMDB to OS keychain`);
    }
  },
};
