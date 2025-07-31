/**
 * Repository Service
 * 
 * Centralized service that provides access to all system repositories
 * for queries and commands across the application.
 */

import { repository } from '@/repository';

// Export the entire repository for direct access
export const repositoryService = repository;

// Re-export for convenience
export type { Repository } from '@/repository';