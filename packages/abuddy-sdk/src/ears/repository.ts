import { getHostModule } from '../runtime/host';
import type { EARS, EntityShapeRegistry, EntityShape } from '../types/entities';

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

let _sharedRepoMod: any;
function sharedRepo() {
  if (!_sharedRepoMod) _sharedRepoMod = getHostModule('shared-repository');
  return _sharedRepoMod;
}

export function findById<E extends keyof EntityShapeRegistry & string>(id: EARS.EntityId<E>): EntityShape<E> | undefined;
export function findById<T>(id: EARS.EntityId): T | undefined;
export function findById(id: EARS.EntityId): unknown {
  return sharedRepo().findById(id);
}

export function findByIdRaw<E extends keyof EntityShapeRegistry & string>(id: EARS.EntityId<E>): EntityShape<E> | undefined;
export function findByIdRaw<T>(id: EARS.EntityId): T | undefined;
export function findByIdRaw(id: EARS.EntityId): unknown {
  return sharedRepo().findByIdRaw(id);
}

export function findAll<E extends keyof EntityShapeRegistry & string>(entityType: E): EntityShape<E>[];
export function findAll<T>(entityType: EARS.Entity): T[];
export function findAll(entityType: EARS.Entity): unknown[] {
  return sharedRepo().findAll(entityType);
}

export function findWhere<E extends keyof EntityShapeRegistry & string>(entityType: E, field: string, value: any): EntityShape<E>[];
export function findWhere<T>(entityType: EARS.Entity, field: string, value: any): T[];
export function findWhere(entityType: EARS.Entity, field: string, value: any): unknown[] {
  return sharedRepo().findWhere(entityType, field, value);
}

export function hasIdCollision(id: EARS.EntityId): boolean {
  return sharedRepo().hasIdCollision(id);
}

export function createEntityWithDefaults<E extends keyof EntityShapeRegistry & string>(
  entityType: E,
  data: Partial<EntityShapeRegistry[E]>,
  prefix?: string,
  providedId?: EARS.EntityId,
): EntityShape<E>;
export function createEntityWithDefaults<T extends Record<string, any> = Record<string, any>>(
  entityType: EARS.Entity,
  data: Partial<T>,
  prefix?: string,
  providedId?: EARS.EntityId,
): T & { id: EARS.EntityId; entityType: EARS.Entity };
export function createEntityWithDefaults(
  entityType: EARS.Entity,
  data: Record<string, any>,
  prefix?: string,
  providedId?: EARS.EntityId,
): unknown {
  return sharedRepo().createEntityWithDefaults(entityType, data, prefix, providedId);
}

export function updateEntity(id: EARS.EntityId, updates: Record<string, any>, skipTimestamp?: boolean): void {
  return sharedRepo().updateEntity(id, updates, skipTimestamp);
}

export function exists(id: EARS.EntityId): boolean {
  return sharedRepo().exists(id);
}

export function findFirst<E extends keyof EntityShapeRegistry & string>(entityType: E, field: string, value: any): EntityShape<E> | undefined;
export function findFirst<T>(entityType: EARS.Entity, field: string, value: any): T | undefined;
export function findFirst(entityType: EARS.Entity, field: string, value: any): unknown {
  return sharedRepo().findFirst(entityType, field, value);
}

export function findWithFields<E extends keyof EntityShapeRegistry & string>(entityType: E, fields: string[]): EntityShape<E>[];
export function findWithFields<T>(entityType: EARS.Entity, fields: string[]): T[];
export function findWithFields(entityType: EARS.Entity, fields: string[]): unknown[] {
  return sharedRepo().findWithFields(entityType, fields);
}

export function findByIdWithFields<E extends keyof EntityShapeRegistry & string>(id: EARS.EntityId<E>, fields: string[]): EntityShape<E> | undefined;
export function findByIdWithFields<T>(id: EARS.EntityId, fields: string[]): T | undefined;
export function findByIdWithFields(id: EARS.EntityId, fields: string[]): unknown {
  return sharedRepo().findByIdWithFields(id, fields);
}

export function countEntities(entityType: EARS.Entity): number {
  return sharedRepo().countEntities(entityType);
}

export function findWithRole<E extends keyof EntityShapeRegistry & string>(entityType: E, role: string): EntityShape<E>[];
export function findWithRole<T>(entityType: EARS.Entity, role: string): T[];
export function findWithRole(entityType: EARS.Entity, role: string): unknown[] {
  return sharedRepo().findWithRole(entityType, role);
}

export function findFirstWithRole<E extends keyof EntityShapeRegistry & string>(entityType: E, role: string): EntityShape<E> | undefined;
export function findFirstWithRole<T>(entityType: EARS.Entity, role: string): T | undefined;
export function findFirstWithRole(entityType: EARS.Entity, role: string): unknown {
  return sharedRepo().findFirstWithRole(entityType, role);
}

export function createRelation(sourceId: EARS.EntityId, relationType: EARS.RelKind, targetId: EARS.EntityId): void {
  return sharedRepo().createRelation(sourceId, relationType, targetId);
}

export const RepositoryErrorCode = new Proxy({} as {
  readonly NOT_FOUND: 'NOT_FOUND';
  readonly VALIDATION_ERROR: 'VALIDATION_ERROR';
  readonly CONSTRAINT_VIOLATION: 'CONSTRAINT_VIOLATION';
  readonly PERMISSION_DENIED: 'PERMISSION_DENIED';
  readonly CONCURRENCY_ERROR: 'CONCURRENCY_ERROR';
  readonly OPERATION_FAILED: 'OPERATION_FAILED';
  readonly UNKNOWN: 'UNKNOWN';
}, {
  get(_, prop: string) { return sharedRepo().RepositoryErrorCode[prop]; },
});

export type RepositoryErrorCode = typeof RepositoryErrorCode[keyof typeof RepositoryErrorCode];

export const RepositoryError: {
  new (message: string, code?: RepositoryErrorCode, details?: any): Error & { code: RepositoryErrorCode; details?: any };
} = new Proxy(function () {} as any, {
  construct(_, args) { return new (sharedRepo().RepositoryError)(...args); },
  get(_, prop) { return sharedRepo().RepositoryError[prop]; },
});

let _queryHelpers: any;
function queryHelpersM() {
  if (!_queryHelpers) _queryHelpers = getHostModule('query-helpers');
  return _queryHelpers;
}
export const queryHelpers: {
  findById: {
    <E extends keyof EntityShapeRegistry & string>(id: EARS.EntityId<E>): EntityShape<E> | undefined;
    <T>(id: EARS.EntityId): T | undefined;
  };
  findWhere: {
    <E extends keyof EntityShapeRegistry & string>(entityType: E, field: string, value: any): EntityShape<E>[];
    <T>(entityType: EARS.Entity, field: string, value: any): T[];
  };
  findAll: {
    <E extends keyof EntityShapeRegistry & string>(entityType: E): EntityShape<E>[];
    <T>(entityType: EARS.Entity): T[];
  };
} = {
  findById: (id: EARS.EntityId) => queryHelpersM().findById(id),
  findWhere: (entityType: EARS.Entity, field: string, value: any) => queryHelpersM().findWhere(entityType, field, value),
  findAll: (entityType: EARS.Entity) => queryHelpersM().findAll(entityType),
};

let _txHelpers: any;
function txHelpersM() {
  if (!_txHelpers) _txHelpers = getHostModule('transaction-helpers');
  return _txHelpers;
}
export const transactionHelpers = new Proxy({} as any, {
  get(_, prop: string) { return txHelpersM()[prop]; },
});

export function prepareEntity<T extends { entityType: EARS.Entity }>(
  entityType: EARS.Entity,
  data: Partial<T>,
  defaults?: Partial<T>
): Omit<T, 'id'> {
  return txHelpersM().prepareEntity(entityType, data, defaults);
}
