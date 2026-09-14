import { EARS } from '@/__generated__/ears';
import type { SecretProvider } from '@abuddy/sdk';

export interface CreateSecretParams {
  provider: SecretProvider;
  value: string;
  customName?: string; // For custom providers
}

export interface SecretReference {
  secretId: EARS.EntityId;
  provider: SecretProvider;
  customName?: string;
}

export interface SecretData {
  id: EARS.EntityId;
  provider: SecretProvider;
  customName?: string;
  createdAt: number;
  updatedAt?: number;
  // Note: actual value is never sent to frontend for security
}