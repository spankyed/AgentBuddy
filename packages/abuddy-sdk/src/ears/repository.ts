// --- Repository registry (real implementation) ---

const entries: Record<string, unknown> = {};

/** Registers a repository under a name. Packs declare theirs in abuddy.json (`features[].repositories`). */
export function registerRepository(name: string, value: unknown): void {
  entries[name] = value;
}

/**
 * Every registered repository, for host code. Packs use the `repository` from their
 * `#generated/repository`, typed with their own and their dependencies' repositories.
 */
export const repository: Record<string, unknown> = /*#__PURE__*/ new Proxy({} as Record<string, unknown>, {
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
});

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
} from './query-helpers.ts';

export {
  prepareEntity, createEntityWithDefaults, updateEntity,
  createRelation as repoCreateRelation, removeRelation as repoRemoveRelation,
} from './transaction-helpers.ts';

export { RepositoryError, RepositoryErrorCode } from './repository-errors.ts';
