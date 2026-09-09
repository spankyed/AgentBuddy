import * as qh from './query-helpers';
import * as th from './transaction-helpers';

// --- Repository registry (real implementation) ---

const entries: Record<string, any> = {};

export function registerRepository(name: string, value: any): void {
  if (entries[name]) {
    console.warn(`[repository] "${name}" registered twice — overwriting`);
  }
  entries[name] = value;
}

export const repository = new Proxy({} as Record<string, any>, {
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
} from './query-helpers';

export {
  prepareEntity, createEntityWithDefaults, updateEntity,
  createRelation as repoCreateRelation, removeRelation as repoRemoveRelation,
  grantRole as repoGrantRole, revokeRole as repoRevokeRole,
} from './transaction-helpers';

export { RepositoryError, RepositoryErrorCode } from './repository-errors';

// STATUS: Unused — no external consumers currently import these namespaced objects.
// Kept for backward compatibility; consumers use the individual functions directly.
export const queryHelpers = {
  findById: qh.findById,
  findWhere: qh.findWhere,
  findAll: qh.findAll,
};

export const transactionHelpers = {
  prepareEntity: th.prepareEntity,
  createEntityWithDefaults: th.createEntityWithDefaults,
  updateEntity: th.updateEntity,
  createRelation: th.createRelation,
  removeRelation: th.removeRelation,
  grantRole: th.grantRole,
  revokeRole: th.revokeRole,
};
