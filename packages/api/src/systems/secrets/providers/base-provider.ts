import { secretsCommands, secretsQueries } from '../repository';
import { settingsQueries, settingsCommands } from '@/systems/settings/repository';
import type { SecretProvider, SecretProviderType } from './types';

/**
 * Base implementation for secret providers
 */
export abstract class BaseSecretProvider implements SecretProvider {
  abstract readonly type: SecretProviderType;
  abstract readonly name: string;
  abstract readonly isBuiltIn: boolean;
  
  protected secretId?: string;
  
  constructor(secretId?: string) {
    this.secretId = secretId;
  }
  
  getSecretId(): string | undefined {
    return this.secretId;
  }
  
  setSecretId(secretId: string): void {
    this.secretId = secretId;
    this.persistSecretId(secretId);
  }
  
  createSecret(value: string): string {
    if (this.secretId && secretsQueries.secretExists(this.secretId)) {
      // Update existing secret
      secretsCommands.updateSecret(this.secretId, value);
      return this.secretId;
    }
    
    // Create new secret
    const secretId = secretsCommands.createSecret(
      this.getSecretName(),
      value,
      this.type,
      this.getDescription()
    );
    
    this.setSecretId(secretId);
    return secretId;
  }
  
  updateSecret(value: string): void {
    if (!this.secretId) {
      throw new Error(`No secret configured for ${this.name}`);
    }
    
    secretsCommands.updateSecret(this.secretId, value);
  }
  
  deleteSecret(): void {
    if (!this.secretId) {
      return;
    }
    
    secretsCommands.deleteSecret(this.secretId);
    this.secretId = undefined;
    this.persistSecretId(undefined);
  }
  
  getValue(): string | null {
    if (!this.secretId) {
      return null;
    }
    
    return secretsQueries.getSecret(this.secretId);
  }
  
  validate(): boolean {
    return true; // Override in subclasses for specific validation
  }
  
  protected abstract getSecretName(): string;
  protected abstract getDescription(): string;
  protected abstract persistSecretId(secretId?: string): void;
}