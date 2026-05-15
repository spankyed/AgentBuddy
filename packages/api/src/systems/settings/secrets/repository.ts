import { EARS } from '@/core/types';
import { tx } from '@/core/ears/helpers/transaction';
import { qx } from '@/core/ears/helpers/query';
import type { SecretEntity, SecretProvider, CreateSecretParams, SecretData } from './types';
import { credentialsProvider, secretAccount } from './credentials-provider';

export const secretsQueries = {
  getAllSecrets: (): SecretEntity[] => {
    return qx(EARS.Entity.Secret).pickAll().map(s => ({
      ...s,
      entityType: EARS.Entity.Secret
    })) as unknown as SecretEntity[];
  },

  getSecret: (id: EARS.EntityId): SecretEntity | null => {
    const secret = qx(id).pickOne(['provider', 'createdAt', 'updatedAt', 'customName']);
    if (!secret) return null;

    return {
      id,
      entityType: EARS.Entity.Secret,
      ...secret
    } as SecretEntity;
  },

  /** Retrieve the secret value from the credentials provider (keychain or LMDB fallback). */
  getSecretValue: (id: EARS.EntityId): string | null => {
    const secret = secretsQueries.getSecret(id);
    if (!secret) return null;
    const account = secretAccount(secret.provider, secret.customName);
    return credentialsProvider.read(id, account);
  },

  getSecretByProvider: (provider: SecretProvider, customName?: string): SecretEntity | null => {
    const secrets = qx(EARS.Entity.Secret)
      .where('provider', provider)
      .pickAll().map(s => ({
        ...s,
        entityType: EARS.Entity.Secret
      })) as unknown as SecretEntity[];

    if (customName) {
      return secrets.find((s: any) => s.customName === customName) || null;
    }

    return secrets[0] || null;
  },

  getSecretsData: (): SecretData[] => {
    return qx(EARS.Entity.Secret)
      .pickAll()
      .map(s => ({
        id: s.id,
        provider: s.provider,
        customName: s.customName,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt
      })) as SecretData[];
  }
};

export const secretsCommands = {
  createSecret: (params: CreateSecretParams): EARS.EntityId => {
    const existingSecret = secretsQueries.getSecretByProvider(params.provider, params.customName);
    if (existingSecret) {
      return secretsCommands.updateSecret(existingSecret.id, params.value);
    }

    const id = tx(EARS.Entity.Secret)
      .batchPut({
        entityType: EARS.Entity.Secret,
        provider: params.provider,
        customName: params.customName,
        createdAt: Date.now()
      })
      .id();

    const account = secretAccount(params.provider, params.customName);
    credentialsProvider.write(id, account, params.value);

    return id;
  },

  updateSecret: (id: EARS.EntityId, value: string): EARS.EntityId => {
    const secret = secretsQueries.getSecret(id);
    if (secret) {
      const account = secretAccount(secret.provider, secret.customName);
      credentialsProvider.write(id, account, value);
    }

    tx(id).batchPut({ updatedAt: Date.now() });

    return id;
  },

  deleteSecret: (id: EARS.EntityId): boolean => {
    const secret = secretsQueries.getSecret(id);
    if (!secret) return false;

    const account = secretAccount(secret.provider, secret.customName);
    credentialsProvider.delete(id, account);
    tx(id).destroy();
    return true;
  },

  deleteSecretByProvider: (provider: SecretProvider, customName?: string): boolean => {
    const secret = secretsQueries.getSecretByProvider(provider, customName);
    if (!secret) return false;

    const account = secretAccount(secret.provider, secret.customName);
    credentialsProvider.delete(secret.id, account);
    tx(secret.id).destroy();
    return true;
  }
};
