import { SecretProviderRegistry, SecretProviderType, CustomSecretConfig } from '@/systems/secrets/providers';
import { SecretAccess } from '@/systems/secrets/access';
import { settingsQueries } from '../repository';

/**
 * Clean operations for managing secrets in settings
 */
export class SecretOperations {
  private registry: SecretProviderRegistry;
  
  constructor() {
    this.registry = SecretProviderRegistry.getInstance();
  }
  
  /**
   * Update an API key (built-in or custom)
   */
  updateApiKey(provider: string, value: string): void {
    this.registry.updateApiKey(provider, value);
    SecretAccess.clearCacheEntry(provider);
  }
  
  /**
   * Create a new custom API key
   */
  createCustomApiKey(config: {
    name: string;
    eventName: string;
    value: string;
    description?: string;
  }): void {
    const customConfig: CustomSecretConfig = {
      id: `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: config.name,
      eventName: config.eventName,
      description: config.description
    };
    
    const provider = this.registry.addCustomProvider(customConfig);
    provider.createSecret(config.value);
    SecretAccess.clearCache();
  }
  
  /**
   * Delete a custom API key
   */
  deleteCustomApiKey(id: string): void {
    const settings = settingsQueries.getSettings();
    const customKey = settings.general.apiKeys.custom?.find(k => k.id === id);
    
    if (customKey) {
      this.registry.removeCustomProvider(customKey.eventName);
      SecretAccess.clearCache();
    }
  }
  
  /**
   * Get all configured API keys (metadata only, no values)
   */
  getAllApiKeyMetadata(): {
    builtIn: Array<{ type: string; name: string; configured: boolean }>;
    custom: Array<{ id: string; name: string; eventName: string; configured: boolean }>;
  } {
    const builtInProviders = this.registry.getBuiltInProviders();
    const customProviders = this.registry.getCustomProviders();
    
    return {
      builtIn: builtInProviders.map(p => ({
        type: p.type,
        name: p.name,
        configured: !!p.getSecretId()
      })),
      custom: customProviders.map(p => ({
        id: (p as any).config.id,
        name: p.name,
        eventName: (p as any).eventName,
        configured: !!p.getSecretId()
      }))
    };
  }
  
  /**
   * Validate all API key configurations
   */
  validateAll(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const providers = this.registry.getAllProviders();
    
    for (const provider of providers) {
      if (!provider.validate()) {
        errors.push(`Invalid configuration for ${provider.name}`);
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  /**
   * Reload all providers from settings
   */
  reload(): void {
    this.registry.reload();
    SecretAccess.clearCache();
  }
}