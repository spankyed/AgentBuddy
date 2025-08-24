import { EARS } from '@/core/types';

export interface SecretEntity {
  id: EARS.EntityId;
  entityType: EARS.Entity.Secret;
  provider: SecretProvider;
  encryptedValue: string; // Will store plain text for now, encryption to be added later
  customName?: string;
  createdAt: number;
  updatedAt?: number;
}

export type SecretProvider = 
  | 'google'
  | 'anthropic' 
  | 'openai'
  | 'groq'
  | 'mistral'
  | 'cohere'
  | 'custom';

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