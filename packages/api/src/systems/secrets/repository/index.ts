import { EARS } from '@/core/types';
import { 
  createEntity, 
  putAttr, 
  getAttr, 
  destroyEntity, 
  getEntitiesOfType 
} from '@/core/utils/ears/attribute-storage';
import { encrypt, decrypt, clearString } from '../crypto';
import type { SecretEntity } from '../types';

/**
 * Commands for creating, updating, and deleting secrets
 */
export const secretsCommands = {
  /**
   * Create a new encrypted secret
   */
  createSecret(name: string, value: string, provider?: string, description?: string): string {
    const { encrypted, iv, authTag } = encrypt(value);
    const secretId = createEntity(EARS.Entity.Secret);
    
    const secret: SecretEntity = {
      id: secretId,
      entityType: EARS.Entity.Secret,
      name,
      encryptedValue: encrypted,
      iv,
      authTag,
      provider,
      description,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    
    // Store the secret entity data
    putAttr(secretId, 'entityData' as EARS.AttrKind, secret);
    
    // Clear the original value from memory
    clearString(value);
    
    return secretId;
  },
  
  /**
   * Update an existing secret's value
   */
  updateSecret(id: string, value: string): void {
    const secret = getAttr(id as EARS.EntityId, 'entityData' as EARS.AttrKind) as SecretEntity;
    if (!secret) {
      throw new Error(`Secret ${id} not found`);
    }
    
    const { encrypted, iv, authTag } = encrypt(value);
    
    const updatedSecret: SecretEntity = {
      ...secret,
      encryptedValue: encrypted,
      iv,
      authTag,
      updatedAt: Date.now()
    };
    
    // Update the secret entity data
    putAttr(id as EARS.EntityId, 'entityData' as EARS.AttrKind, updatedSecret);
    
    // Clear the original value from memory
    clearString(value);
  },
  
  /**
   * Delete a secret
   */
  deleteSecret(id: string): void {
    const secret = getAttr(id as EARS.EntityId, 'entityData' as EARS.AttrKind) as SecretEntity;
    if (!secret) {
      throw new Error(`Secret ${id} not found`);
    }
    
    destroyEntity(id as EARS.EntityId);
  },
  
  /**
   * Update secret metadata (name, provider, description)
   */
  updateSecretMetadata(id: string, updates: { name?: string; provider?: string; description?: string }): void {
    const secret = getAttr(id as EARS.EntityId, 'entityData' as EARS.AttrKind) as SecretEntity;
    if (!secret) {
      throw new Error(`Secret ${id} not found`);
    }
    
    const updatedSecret: SecretEntity = {
      ...secret,
      ...updates,
      updatedAt: Date.now()
    };
    
    // Update the secret entity data
    putAttr(id as EARS.EntityId, 'entityData' as EARS.AttrKind, updatedSecret);
  }
};

/**
 * Queries for retrieving secrets and their metadata
 */
export const secretsQueries = {
  /**
   * Get a decrypted secret value
   * IMPORTANT: Caller is responsible for clearing the returned value from memory
   */
  getSecret(id: string): string | null {
    const secret = getAttr(id as EARS.EntityId, 'entityData' as EARS.AttrKind) as SecretEntity;
    if (!secret) {
      return null;
    }
    
    try {
      return decrypt(secret.encryptedValue, secret.iv, secret.authTag);
    } catch (error) {
      console.error(`Failed to decrypt secret ${id}:`, error);
      return null;
    }
  },
  
  /**
   * Get secret metadata without the encrypted value
   */
  getSecretMetadata(id: string): Omit<SecretEntity, 'encryptedValue' | 'iv' | 'authTag'> | null {
    const secret = getAttr(id as EARS.EntityId, 'entityData' as EARS.AttrKind) as SecretEntity;
    if (!secret) {
      return null;
    }
    
    const { encryptedValue, iv, authTag, ...metadata } = secret;
    return metadata;
  },
  
  /**
   * Get all secrets metadata (no values)
   */
  getAllSecrets(): Array<{
    id: string;
    name: string;
    provider?: string;
    description?: string;
    createdAt: number;
    updatedAt: number;
  }> {
    const secretIds = getEntitiesOfType(EARS.Entity.Secret);
    const secrets: SecretEntity[] = [];
    
    for (const id of secretIds) {
      const secret = getAttr(id, 'entityData' as EARS.AttrKind) as SecretEntity;
      if (secret) {
        secrets.push(secret);
      }
    }
    
    return secrets.map(secret => ({
      id: secret.id,
      name: secret.name,
      provider: secret.provider,
      description: secret.description,
      createdAt: secret.createdAt,
      updatedAt: secret.updatedAt
    }));
  },
  
  /**
   * Find a secret by name
   */
  getSecretByName(name: string): string | null {
    const secretIds = getEntitiesOfType(EARS.Entity.Secret);
    
    for (const id of secretIds) {
      const secret = getAttr(id, 'entityData' as EARS.AttrKind) as SecretEntity;
      if (secret && secret.name === name) {
        return secret.id;
      }
    }
    
    return null;
  },
  
  /**
   * Check if a secret exists
   */
  secretExists(id: string): boolean {
    return getAttr(id as EARS.EntityId, 'entityData' as EARS.AttrKind, 0) !== undefined;
  },
  
  /**
   * Get secrets by provider
   */
  getSecretsByProvider(provider: string): Array<{
    id: string;
    name: string;
    description?: string;
  }> {
    const secretIds = getEntitiesOfType(EARS.Entity.Secret);
    const results: Array<{ id: string; name: string; description?: string }> = [];
    
    for (const id of secretIds) {
      const secret = getAttr(id, 'entityData' as EARS.AttrKind) as SecretEntity;
      if (secret && secret.provider === provider) {
        results.push({
          id: secret.id,
          name: secret.name,
          description: secret.description
        });
      }
    }
    
    return results;
  }
};