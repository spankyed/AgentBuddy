import { getHostModule } from '../runtime/host';
import * as qh from './query-helpers';
import * as th from './transaction-helpers';

// --- Repository registry (stays as host delegate — API owns the registry) ---

let _repositoryMod: any;
function repoMod() {
  if (!_repositoryMod) _repositoryMod = getHostModule('repository');
  return _repositoryMod;
}

export const repository: any = new Proxy({} as any, {
  get(_, prop: string) {
    return repoMod().repository[prop];
  },
});

const _earlyRegistrations: any[][] = [];
let _repoReady = false;

export function registerRepository(...args: any[]): void {
  if (_repoReady) {
    return repoMod().registerRepository(...args);
  }
  _earlyRegistrations.push(args);
}

export function _flushEarlyRegistrations(): void {
  _repoReady = true;
  for (const args of _earlyRegistrations) {
    repoMod().registerRepository(...args);
  }
  _earlyRegistrations.length = 0;
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
