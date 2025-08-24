import { settingsQueries } from '@/systems/settings/repository';
import { secretsQueries } from './repository';
import { clearString } from './crypto';

/**
 * Secure API for accessing secrets
 * Provides caching and secure access patterns
 */
export class SecretAccess {
  private static cache = new Map<string, { value: string; expiry: number }>();
  private static readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  
  /**
   * Get an API key by provider name or custom event name
   * @param provider - Provider name (google, anthropic, openai) or custom event name
   * @returns The decrypted API key or null if not found
   */
  static getApiKey(provider: string): string | null {
    const settings = settingsQueries.getSettings();
    const apiKeys = settings?.general?.apiKeys;
    
    if (!apiKeys) {
      return null;
    }
    
    // Determine the secret ID based on provider
    let secretId: string | undefined;
    
    // Check built-in providers
    if (provider === 'google') {
      secretId = apiKeys.google;
    } else if (provider === 'anthropic') {
      secretId = apiKeys.anthropic;
    } else if (provider === 'openai') {
      secretId = apiKeys.openai;
    } else {
      // Check custom keys by event name
      const customKey = apiKeys.custom?.find(k => k.eventName === provider);
      secretId = customKey?.secretId;
    }
    
    if (!secretId) {
      return null;
    }
    
    // Check cache first
    const cached = this.cache.get(secretId);
    if (cached && cached.expiry > Date.now()) {
      return cached.value;
    }
    
    // Fetch from repository
    const value = secretsQueries.getSecret(secretId);
    if (value) {
      // Cache the value
      this.cache.set(secretId, {
        value,
        expiry: Date.now() + this.CACHE_TTL
      });
    }
    
    return value;
  }
  
  /**
   * Get multiple API keys at once
   * @param providers - Array of provider names
   * @returns Map of provider names to API keys
   */
  static getApiKeys(providers: string[]): Map<string, string | null> {
    const results = new Map<string, string | null>();
    
    for (const provider of providers) {
      results.set(provider, this.getApiKey(provider));
    }
    
    return results;
  }
  
  /**
   * Get a custom API key by its ID
   * @param customKeyId - The ID of the custom key
   * @returns The decrypted API key or null if not found
   */
  static getCustomApiKey(customKeyId: string): string | null {
    const settings = settingsQueries.getSettings();
    const apiKeys = settings?.general?.apiKeys;
    
    if (!apiKeys?.custom) {
      return null;
    }
    
    const customKey = apiKeys.custom.find(k => k.id === customKeyId);
    if (!customKey) {
      return null;
    }
    
    // Check cache
    const cached = this.cache.get(customKey.secretId);
    if (cached && cached.expiry > Date.now()) {
      return cached.value;
    }
    
    // Fetch from repository
    const value = secretsQueries.getSecret(customKey.secretId);
    if (value) {
      // Cache the value
      this.cache.set(customKey.secretId, {
        value,
        expiry: Date.now() + this.CACHE_TTL
      });
    }
    
    return value;
  }
  
  /**
   * Get all available API key providers
   * @returns Array of provider names that have configured API keys
   */
  static getAvailableProviders(): string[] {
    const settings = settingsQueries.getSettings();
    const apiKeys = settings?.general?.apiKeys;
    
    if (!apiKeys) {
      return [];
    }
    
    const providers: string[] = [];
    
    if (apiKeys.google) providers.push('google');
    if (apiKeys.anthropic) providers.push('anthropic');
    if (apiKeys.openai) providers.push('openai');
    
    if (apiKeys.custom) {
      for (const customKey of apiKeys.custom) {
        providers.push(customKey.eventName);
      }
    }
    
    return providers;
  }
  
  /**
   * Check if an API key is configured for a provider
   * @param provider - Provider name or custom event name
   * @returns True if an API key is configured
   */
  static hasApiKey(provider: string): boolean {
    const settings = settingsQueries.getSettings();
    const apiKeys = settings?.general?.apiKeys;
    
    if (!apiKeys) {
      return false;
    }
    
    if (provider === 'google') return !!apiKeys.google;
    if (provider === 'anthropic') return !!apiKeys.anthropic;
    if (provider === 'openai') return !!apiKeys.openai;
    
    // Check custom keys
    return apiKeys.custom?.some(k => k.eventName === provider) ?? false;
  }
  
  /**
   * Clear the cache
   * Should be called when secrets are updated
   */
  static clearCache(): void {
    // Clear values from memory before clearing cache
    for (const [, cached] of this.cache) {
      clearString(cached.value);
    }
    this.cache.clear();
  }
  
  /**
   * Clear a specific secret from cache
   * @param secretId - The secret ID to clear from cache
   */
  static clearCacheEntry(secretId: string): void {
    const cached = this.cache.get(secretId);
    if (cached) {
      clearString(cached.value);
      this.cache.delete(secretId);
    }
  }
  
  /**
   * Get cache statistics (for debugging)
   */
  static getCacheStats(): { size: number; entries: string[] } {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys())
    };
  }
}

/**
 * Convenience function for getting an API key
 * @param provider - Provider name or custom event name
 * @returns The decrypted API key or null if not found
 */
export function getApiKey(provider: string): string | null {
  return SecretAccess.getApiKey(provider);
}

/**
 * Convenience function for checking if an API key exists
 * @param provider - Provider name or custom event name
 * @returns True if an API key is configured
 */
export function hasApiKey(provider: string): boolean {
  return SecretAccess.hasApiKey(provider);
}