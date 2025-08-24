import { SecretProvider, SecretProviderType, CustomSecretConfig } from './types';
import { BuiltInSecretProvider } from './built-in-provider';
import { CustomSecretProvider } from './custom-provider';
import { settingsQueries } from '@/systems/settings/repository';

/**
 * Registry for managing all secret providers
 */
export class SecretProviderRegistry {
  private providers = new Map<string, SecretProvider>();
  private static instance: SecretProviderRegistry;
  
  private constructor() {
    this.loadProviders();
  }
  
  static getInstance(): SecretProviderRegistry {
    if (!this.instance) {
      this.instance = new SecretProviderRegistry();
    }
    return this.instance;
  }
  
  /**
   * Load all providers from settings
   */
  private loadProviders(): void {
    // Load built-in providers
    this.loadBuiltInProviders();
    
    // Load custom providers
    this.loadCustomProviders();
  }
  
  private loadBuiltInProviders(): void {
    const builtInTypes = [
      SecretProviderType.GOOGLE,
      SecretProviderType.ANTHROPIC,
      SecretProviderType.OPENAI
    ];
    
    for (const type of builtInTypes) {
      const provider = BuiltInSecretProvider.fromSettings(type);
      this.providers.set(type, provider);
    }
  }
  
  private loadCustomProviders(): void {
    const customProviders = CustomSecretProvider.getAllFromSettings();
    
    for (const provider of customProviders) {
      this.providers.set(provider.eventName, provider);
    }
  }
  
  /**
   * Get a provider by its key (type for built-in, eventName for custom)
   */
  getProvider(key: string): SecretProvider | undefined {
    return this.providers.get(key);
  }
  
  /**
   * Get all providers
   */
  getAllProviders(): SecretProvider[] {
    return Array.from(this.providers.values());
  }
  
  /**
   * Get only built-in providers
   */
  getBuiltInProviders(): SecretProvider[] {
    return this.getAllProviders().filter(p => p.isBuiltIn);
  }
  
  /**
   * Get only custom providers
   */
  getCustomProviders(): SecretProvider[] {
    return this.getAllProviders().filter(p => !p.isBuiltIn);
  }
  
  /**
   * Add or update a custom provider
   */
  addCustomProvider(config: CustomSecretConfig): SecretProvider {
    const provider = CustomSecretProvider.fromConfig(config);
    this.providers.set(provider.eventName, provider);
    return provider;
  }
  
  /**
   * Remove a custom provider
   */
  removeCustomProvider(eventName: string): void {
    const provider = this.providers.get(eventName);
    if (provider && !provider.isBuiltIn) {
      provider.deleteSecret();
      this.providers.delete(eventName);
    }
  }
  
  /**
   * Get an API key value by provider key
   */
  getApiKey(key: string): string | null {
    const provider = this.getProvider(key);
    return provider?.getValue() || null;
  }
  
  /**
   * Update an API key value
   */
  updateApiKey(key: string, value: string): void {
    const provider = this.getProvider(key);
    if (!provider) {
      throw new Error(`Unknown API key provider: ${key}`);
    }
    
    if (provider.getSecretId()) {
      provider.updateSecret(value);
    } else {
      provider.createSecret(value);
    }
  }
  
  /**
   * Check if a provider exists
   */
  hasProvider(key: string): boolean {
    return this.providers.has(key);
  }
  
  /**
   * Reload all providers from settings
   */
  reload(): void {
    this.providers.clear();
    this.loadProviders();
  }
  
  /**
   * Clear the registry cache
   */
  clear(): void {
    this.providers.clear();
  }
}