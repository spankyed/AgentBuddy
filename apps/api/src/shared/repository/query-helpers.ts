import { qx } from '@/shared/ears/helpers/query';
import { EARS } from '@/shared/ears/types';

/**
 * Type-safe query helpers to eliminate repetitive type casting
 * These are simple wrappers around EARS query functions
 */

// Find a single entity by ID
export function findById<T>(id: EARS.EntityId): T | undefined {
  const results = qx([id]).pickAll();
  return results[0] as T | undefined;
}

// Find all entities of a given type
export function findAll<T>(entityType: EARS.Entity): T[] {
  return qx(entityType).pickAll() as T[];
}

// Find entities matching a field value
export function findWhere<T>(
  entityType: EARS.Entity,
  field: string,
  value: any
): T[] {
  return qx(entityType)
    .where(field, value)
    .pickAll() as T[];
}

// Find first entity matching criteria
export function findFirst<T>(
  entityType: EARS.Entity,
  field: string,
  value: any
): T | undefined {
  const results = findWhere<T>(entityType, field, value);
  return results[0];
}

// Find entities with specific fields only
export function findWithFields<T>(
  entityType: EARS.Entity,
  fields: string[]
): T[] {
  return qx(entityType).pick(fields) as T[];
}

// Find single entity with specific fields
export function findByIdWithFields<T>(
  id: EARS.EntityId,
  fields: string[]
): T | undefined {
  const results = qx([id]).pick(fields);
  return results[0] as T | undefined;
}

// Count entities
export function countEntities(entityType: EARS.Entity): number {
  return qx(entityType).count();
}

// Check if entity exists
export function exists(id: EARS.EntityId): boolean {
  return qx([id]).count() > 0;
}

// Find entities with a specific role
export function findWithRole<T>(
  entityType: EARS.Entity,
  role: string
): T[] {
  return qx(entityType)
    .withRole(role)
    .pickAll() as T[];
}

// Find first entity with a specific role
export function findFirstWithRole<T>(
  entityType: EARS.Entity,
  role: string
): T | undefined {
  const results = qx(entityType)
    .withRole(role)
    .pickAll();
  return results[0] as T | undefined;
} 