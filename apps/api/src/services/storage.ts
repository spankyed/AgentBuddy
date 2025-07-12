import type { 
  StorageService, 
  StorageResult, 
  StorageLoadResult, 
  StorageDeleteResult,
  StorageListResult,
  StorageOptions,
  StorageListOptions,
  StorageMetadata,
  StorageItem,
  ServiceMetadata 
} from './types';

/**
 * Storage Service Implementation
 * Provides key-value storage capabilities for actions
 */
export class StorageServiceImpl implements StorageService {
  // In-memory storage implementation
  private storage: Map<string, { data: any; metadata: StorageMetadata }> = new Map();

  async save<T = any>(key: string, data: T, options?: StorageOptions): Promise<StorageResult> {
    const serialized = JSON.stringify(data);
    const size = new Blob([serialized]).size;
    const etag = `"${Date.now()}-${Math.random().toString(36).substr(2, 9)}"`;
    
    const metadata: StorageMetadata = {
      size,
      lastModified: Date.now(),
      contentType: 'application/json',
      etag,
      custom: options?.metadata
    };

    this.storage.set(key, { data, metadata });

    // Handle TTL in implementation
    if (options?.ttl) {
      setTimeout(() => {
        this.storage.delete(key);
      }, options.ttl * 1000);
    }

    return {
      key,
      size,
      success: true,
      etag,
      metadata: options?.metadata
    };
  }

  async load<T = any>(key: string): Promise<StorageLoadResult<T>> {
    const stored = this.storage.get(key);
    
    if (!stored) {
      return {
        data: null as any,
        found: false
      };
    }

    return {
      data: stored.data as T,
      found: true,
      metadata: stored.metadata
    };
  }

  async delete(key: string): Promise<StorageDeleteResult> {
    const existed = this.storage.has(key);
    this.storage.delete(key);
    
    return {
      deleted: existed,
      key
    };
  }

  async list(prefix?: string, options?: StorageListOptions): Promise<StorageListResult> {
    const allKeys = Array.from(this.storage.keys());
    const filteredKeys = prefix 
      ? allKeys.filter(key => key.startsWith(prefix))
      : allKeys;

    const limit = options?.limit || 100;
    const offset = options?.offset || 0;
    const paginatedKeys = filteredKeys.slice(offset, offset + limit);

    let items: StorageItem[] | undefined;
    if (options?.includeMetadata) {
      items = paginatedKeys.map(key => {
        const stored = this.storage.get(key)!;
        return {
          key,
          size: stored.metadata.size,
          lastModified: stored.metadata.lastModified,
          metadata: stored.metadata.custom
        };
      });
    }

    return {
      keys: paginatedKeys,
      count: paginatedKeys.length,
      total: filteredKeys.length,
      items
    };
  }

  async exists(key: string): Promise<boolean> {
    return this.storage.has(key);
  }

  async getMetadata(key: string): Promise<StorageMetadata> {
    const stored = this.storage.get(key);
    
    if (!stored) {
      throw new Error(`Key not found: ${key}`);
    }

    return stored.metadata;
  }
}

// Service metadata for potential action generation
export const storageServiceMetadata: ServiceMetadata = {
  name: 'storage',
  description: 'Key-value storage service for persistent data storage',
  category: 'storage',
  methods: [
    {
      name: 'save',
      description: 'Save data to storage with a key',
      input: [
        {
          name: 'key',
          type: 'string',
          required: true,
          description: 'The storage key'
        },
        {
          name: 'data',
          type: 'any',
          required: true,
          description: 'The data to store'
        },
        {
          name: 'options',
          type: 'StorageOptions',
          required: false,
          description: 'Storage options (TTL, metadata, encryption, etc.)'
        }
      ],
      returns: 'StorageResult',
      example: `const result = await services.storage.save(
  'user-preferences',
  { theme: 'dark', language: 'en' },
  { ttl: 3600, metadata: { userId: '123' } }
);`
    },
    {
      name: 'load',
      description: 'Load data from storage by key',
      input: [
        {
          name: 'key',
          type: 'string',
          required: true,
          description: 'The storage key'
        }
      ],
      returns: 'StorageLoadResult<T>',
      example: `const result = await services.storage.load('user-preferences');
if (result.found) {
  console.log('Preferences:', result.data);
}`
    },
    {
      name: 'delete',
      description: 'Delete data from storage',
      input: [
        {
          name: 'key',
          type: 'string',
          required: true,
          description: 'The storage key to delete'
        }
      ],
      returns: 'StorageDeleteResult',
      example: `const result = await services.storage.delete('temp-data');
console.log('Deleted:', result.deleted);`
    },
    {
      name: 'list',
      description: 'List keys in storage with optional prefix filter',
      input: [
        {
          name: 'prefix',
          type: 'string',
          required: false,
          description: 'Key prefix to filter by'
        },
        {
          name: 'options',
          type: 'StorageListOptions',
          required: false,
          description: 'List options (pagination, include metadata)'
        }
      ],
      returns: 'StorageListResult',
      example: `const result = await services.storage.list('user-', {
  limit: 10,
  includeMetadata: true
});`
    },
    {
      name: 'exists',
      description: 'Check if a key exists in storage',
      input: [
        {
          name: 'key',
          type: 'string',
          required: true,
          description: 'The storage key to check'
        }
      ],
      returns: 'boolean',
      example: `const exists = await services.storage.exists('user-settings');
if (!exists) {
  await services.storage.save('user-settings', defaultSettings);
}`
    },
    {
      name: 'getMetadata',
      description: 'Get metadata for a stored key',
      input: [
        {
          name: 'key',
          type: 'string',
          required: true,
          description: 'The storage key'
        }
      ],
      returns: 'StorageMetadata',
      example: `const metadata = await services.storage.getMetadata('large-file');
console.log('File size:', metadata.size);
console.log('Last modified:', new Date(metadata.lastModified));`
    }
  ]
};

// Factory function for creating storage service
export function createStorageService(): StorageService {
  return new StorageServiceImpl();
}