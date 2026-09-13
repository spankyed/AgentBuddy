// --- Repository registry (real implementation) ---

const entries: Record<string, any> = {};

export function registerRepository(name: string, value: any): void {
  entries[name] = value;
}

export const repository = /*#__PURE__*/ new Proxy({} as Record<string, any>, {
  get(_, prop) {
    if (typeof prop === 'symbol') return undefined;
    const value = entries[prop];
    if (value === undefined) {
      throw new Error(
        `[repository] "${prop}" is not registered. Ensure the owning system's repository module is imported before access.`
      );
    }
    return value;
  },
}) as any;

export type Repository = typeof repository;

export function _flushEarlyRegistrations(): void {
  // No-op — kept for backward compat. Early registrations are no longer
  // needed since the registry now lives directly in the SDK.
}

// --- Real implementations (moved from API shared-repository) ---

export {
  findById, findByIdRaw, findAll, findWhere, findFirst,
  findWithFields, findByIdWithFields, countEntities,
  exists, findWithRole, findFirstWithRole,
  hasIdCollision,
} from './query-helpers.js';

export {
  prepareEntity, createEntityWithDefaults, updateEntity,
  createRelation as repoCreateRelation, removeRelation as repoRemoveRelation,
} from './transaction-helpers.js';

export { RepositoryError, RepositoryErrorCode } from './repository-errors.js';
