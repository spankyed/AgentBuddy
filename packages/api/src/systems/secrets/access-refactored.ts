import { SecretProviderRegistry } from './providers';
import { clearString } from './crypto';

/**
 * Clean API for accessing secrets with caching
 */
export class SecretAccessService {
  private static instance: SecretAccessService;
  private cache = new Map<string, { value: string; expiry: number }>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private registry: SecretProviderRegistry;
  
  private constructor() {
    this.registry = SecretProviderRegistry.getInstance();
  }
  
  static getInstance(): SecretAccessService {
    if (!this.instance) {
      this.instance = new SecretAccessService();
    }
    return this.instance;
  }
  
  /**
   * Get an API key by provider name or custom event name
   */
  getApiKey(providerKey: string): string | null {
    // Check cache first
    const cached = this.cache.get(providerKey);
    if (cached && cached.expiry > Date.now()) {
      return cached.value;
    }
    
    // Get from provider
    const value = this.registry.getApiKey(providerKey);
    
    if (value) {
      // Cache the value
      this.cache.set(providerKey, {
        value,
        expiry: Date.now() + this.CACHE_TTL
      });
    }
    
    return value;
  }
  
  /**
   * Get multiple API keys at once
   */
  getApiKeys(providerKeys: string[]): Map<string, string | null> {
    const results = new Map<string, string | null>();
    
    for (const key of providerKeys) {
      results.set(key, this.getApiKey(key));
    }
    
    return results;
  }
  
  /**
   * Check if an API key is configured
   */
  hasApiKey(providerKey: string): boolean {
    return this.registry.hasProvider(providerKey) && 
           this.getApiKey(providerKey) !== null;
  }
  
  /**
   * Get all available API key providers
   */
  getAvailableProviders(): string[] {
    return this.registry.getAllProviders()
      .filter(p => p.getSecretId())
      .map(p => p.isBuiltIn ? p.type : (p as any).eventName);
  }
  
  /**
   * Clear the entire cache
   */
  clearCache(): void {
    // Securely clear values from memory
    for (const [, cached] of this.cache) {
      clearString(cached.value);
    }
    this.cache.clear();
  }
  
  /**
   * Clear a specific entry from cache
   */
  clearCacheEntry(providerKey: string): void {
    const cached = this.cache.get(providerKey);
    if (cached) {
      clearString(cached.value);
      this.cache.delete(providerKey);
    }
  }
  
  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; entries: string[] } {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys())
    };
  }
}

// Export singleton instance methods for backward compatibility
export const SecretAccess = {
  getApiKey: (provider: string) => SecretAccessService.getInstance().getApiKey(provider),
  getApiKeys: (providers: string[]) => SecretAccessService.getInstance().getApiKeys(providers),
  hasApiKey: (provider: string) => SecretAccessService.getInstance().hasApiKey(provider),
  getAvailableProviders: () => SecretAccessService.getInstance().getAvailableProviders(),
  clearCache: () => SecretAccessService.getInstance().clearCache(),
  clearCacheEntry: (provider: string) => SecretAccessService.getInstance().clearCacheEntry(provider),
  getCacheStats: () => SecretAccessService.getInstance().getCacheStats()
};

// Convenience functions
export const getApiKey = (provider: string) => SecretAccess.getApiKey(provider);
export const hasApiKey = (provider: string) => SecretAccess.hasApiKey(provider);