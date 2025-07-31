/**
 * Database Service
 * 
 * Centralized service that provides access to all database operations
 * including EARS transaction and query utilities.
 */

// Export transaction helpers for common operations
export {
  prepareEntity,
  createEntityWithDefaults,
  updateEntity,
  createRelation,
  removeRelation,
  grantRole,
  revokeRole
} from '@/core/utils/repository/transaction-helpers';

// Export EARS transaction builder
export { tx } from '@/core/utils/ears/helpers/transaction';
export type { SafeLinkOptions } from '@/core/utils/ears/helpers/transaction';

// Export EARS query builder
export { qx } from '@/core/utils/ears/helpers/query';

// Export type-safe query helpers
export {
  findById,
  findAll,
  findWhere,
  findFirst,
  findWithFields,
  findByIdWithFields,
  countEntities,
  exists,
  findWithRole,
  findFirstWithRole
} from '@/core/utils/repository/query-helpers';

// Re-export EARS types for convenience
export { EARS } from '@/core/types';