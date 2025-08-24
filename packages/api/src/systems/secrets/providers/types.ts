/**
 * Secret provider types and interfaces
 */

export enum SecretProviderType {
  GOOGLE = 'google',
  ANTHROPIC = 'anthropic',
  OPENAI = 'openai',
  CUSTOM = 'custom'
}

export interface SecretProvider {
  readonly type: SecretProviderType;
  readonly name: string;
  readonly isBuiltIn: boolean;
  
  /**
   * Get the secret ID for this provider
   */
  getSecretId(): string | undefined;
  
  /**
   * Set the secret ID for this provider
   */
  setSecretId(secretId: string): void;
  
  /**
   * Create a new secret for this provider
   */
  createSecret(value: string): string;
  
  /**
   * Update the secret value
   */
  updateSecret(value: string): void;
  
  /**
   * Delete the secret
   */
  deleteSecret(): void;
  
  /**
   * Get the decrypted secret value
   */
  getValue(): string | null;
  
  /**
   * Validate the provider configuration
   */
  validate(): boolean;
}

export interface CustomSecretConfig {
  id: string;
  name: string;
  eventName: string;
  secretId?: string;
  description?: string;
}

export interface SecretProviderFactory {
  createProvider(type: SecretProviderType, config?: any): SecretProvider;
  createCustomProvider(config: CustomSecretConfig): SecretProvider;
}