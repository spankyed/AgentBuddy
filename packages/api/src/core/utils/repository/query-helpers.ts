import { qx } from '@/core/ears/helpers/query';
import { EARS } from '@/core/types';

/**
 * Type-safe query helpers to eliminate repetitive type casting
 * These helpers automatically filter out soft-deleted entities (deleted: true)
 * Use findByIdRaw for cases where you need to access deleted entities (e.g., checking existence before delete)
 */

// Internal helper to check if entity is soft-deleted
const isDeleted = (entity: any): boolean => entity?.deleted === true;

// Find a single entity by ID (excludes soft-deleted)
export function findById<T>(id: EARS.EntityId): T | undefined {
  const entity = qx([id]).pickAll()[0] as T | undefined;
  if (isDeleted(entity)) {
    return undefined;
  }
  return entity;
}

// Find entity by ID without filtering (for internal use, e.g., delete operations)
export function findByIdRaw<T>(id: EARS.EntityId): T | undefined {
  const results = qx([id]).pickAll();
  return results[0] as T | undefined;
}

// Find all entities of a given type (excludes soft-deleted)
export function findAll<T>(entityType: EARS.Entity): T[] {
  const all = qx(entityType).pickAll() as T[];
  return all.filter(entity => !isDeleted(entity));
}

// Find entities matching a field value (excludes soft-deleted)
export function findWhere<T>(
  entityType: EARS.Entity,
  field: string,
  value: any
): T[] {
  const results = qx(entityType)
    .where(field, value)
    .pickAll() as T[];
  return results.filter(entity => !isDeleted(entity));
}

// Find first entity matching criteria (excludes soft-deleted)
export function findFirst<T>(
  entityType: EARS.Entity,
  field: string,
  value: any
): T | undefined {
  const results = findWhere<T>(entityType, field, value);
  return results[0];
}

// Find entities with specific fields only (excludes soft-deleted)
export function findWithFields<T>(
  entityType: EARS.Entity,
  fields: string[]
): T[] {
  const all = qx(entityType).pick(fields) as T[];
  return all.filter(entity => !isDeleted(entity));
}

// Find single entity with specific fields (excludes soft-deleted)
export function findByIdWithFields<T>(
  id: EARS.EntityId,
  fields: string[]
): T | undefined {
  const entity = qx([id]).pick(fields)[0] as T | undefined;
  if (isDeleted(entity)) {
    return undefined;
  }
  return entity;
}

// Count entities (excludes soft-deleted)
export function countEntities(entityType: EARS.Entity): number {
  const all = findAll(entityType);
  return all.length;
}

// Check if entity exists (raw - includes deleted entities)
// This is intentionally raw since it's used for existence checks before soft-delete
export function exists(id: EARS.EntityId): boolean {
  return qx([id]).count() > 0;
}

// Find entities with a specific role (excludes soft-deleted)
export function findWithRole<T>(
  entityType: EARS.Entity,
  role: string
): T[] {
  const results = qx(entityType)
    .withRole(role)
    .pickAll() as T[];
  return results.filter(entity => !isDeleted(entity));
}

// Find first entity with a specific role (excludes soft-deleted)
export function findFirstWithRole<T>(
  entityType: EARS.Entity,
  role: string
): T | undefined {
  const results = findWithRole<T>(entityType, role);
  return results[0];
} 