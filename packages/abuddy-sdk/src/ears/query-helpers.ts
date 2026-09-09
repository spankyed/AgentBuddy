// STATUS: Unused — no external consumers currently import these helpers.
// Kept for future use; the individual functions are exported from the SDK barrel.
import { qx } from './query';
import type { EARS } from '../types/entities';

const isDeleted = (entity: any): boolean => entity?.deleted === true;

export function findById<T>(id: EARS.EntityId): T | undefined {
  const entity = qx([id]).pickAll()[0] as T | undefined;
  if (isDeleted(entity)) return undefined;
  return entity;
}

export function findByIdRaw<T>(id: EARS.EntityId): T | undefined {
  return qx([id]).pickAll()[0] as T | undefined;
}

export function findAll<T>(entityType: EARS.Entity): T[] {
  return (qx(entityType).pickAll() as T[]).filter(entity => !isDeleted(entity));
}

export function findWhere<T>(entityType: EARS.Entity, field: string, value: any): T[] {
  return (qx(entityType).where(field, value).pickAll() as T[]).filter(entity => !isDeleted(entity));
}

export function findFirst<T>(entityType: EARS.Entity, field: string, value: any): T | undefined {
  return findWhere<T>(entityType, field, value)[0];
}

export function findWithFields<T>(entityType: EARS.Entity, fields: string[]): T[] {
  return (qx(entityType).pick(fields) as T[]).filter(entity => !isDeleted(entity));
}

export function findByIdWithFields<T>(id: EARS.EntityId, fields: string[]): T | undefined {
  const entity = qx([id]).pick(fields)[0] as T | undefined;
  if (isDeleted(entity)) return undefined;
  return entity;
}

export function countEntities(entityType: EARS.Entity): number {
  return findAll(entityType).length;
}

export function exists(id: EARS.EntityId): boolean {
  return qx([id]).count() > 0;
}

export function findWithRole<T>(entityType: EARS.Entity, role: string): T[] {
  return (qx(entityType).withRole(role).pickAll() as T[]).filter(entity => !isDeleted(entity));
}

export function findFirstWithRole<T>(entityType: EARS.Entity, role: string): T | undefined {
  return findWithRole<T>(entityType, role)[0];
}

export function hasIdCollision(providedId: string | undefined): boolean {
  if (!providedId) return false;
  return exists(providedId as EARS.EntityId);
}
