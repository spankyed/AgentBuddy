// STATUS: Unused — no external consumers currently import these helpers.
// Kept for future use; the individual functions are exported from the SDK barrel.
import { qx } from './query.ts';
import type { EARS } from '../types/entities.ts';

const isDeleted = (entity: any): boolean => entity?.deleted === true;

// Host-internal and untyped: pack code gets these typed from its #generated/ears (defineEars)
export function findById<T = unknown>(id: EARS.EntityId): T | undefined;
export function findById(id: EARS.EntityId): any {
  const entity = qx([id]).pickAll()[0] as any;
  if (isDeleted(entity)) return undefined;
  return entity;
}

export function findByIdRaw<T = unknown>(id: EARS.EntityId): T | undefined;
export function findByIdRaw(id: EARS.EntityId): any {
  return qx([id]).pickAll()[0];
}

export function findAll<T = unknown>(entityType: EARS.Entity): T[];
export function findAll(entityType: EARS.Entity): any[] {
  return (qx(entityType).pickAll() as any[]).filter(entity => !isDeleted(entity));
}

export function findWhere<T = unknown>(entityType: EARS.Entity, field: string, value: any): T[];
export function findWhere(entityType: EARS.Entity, field: string, value: any): any[] {
  return (qx(entityType).where(field, value).pickAll() as any[]).filter(entity => !isDeleted(entity));
}

export function findFirst<T = unknown>(entityType: EARS.Entity, field: string, value: any): T | undefined;
export function findFirst(entityType: EARS.Entity, field: string, value: any): any {
  return (findWhere as (t: EARS.Entity, f: string, v: any) => any[])(entityType, field, value)[0];
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
