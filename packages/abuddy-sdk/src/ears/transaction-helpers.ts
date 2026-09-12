// STATUS: Unused — no external consumers currently import these helpers.
// Kept for future use; the individual functions are exported from the SDK barrel.
import { tx } from './transaction';
import { getTimestamp, generateShortCode, generateLabelWithCount } from './entity-utils';
import { EARS } from '../types/entities';

export function prepareEntity<T extends { entityType: EARS.Entity }>(
  entityType: EARS.Entity,
  data: Partial<T>,
  defaults?: Partial<T>
): Omit<T, 'id'> {
  const ts = getTimestamp();
  return {
    ...defaults,
    ...data,
    entityType,
    createdAt: ts,
    updatedAt: ts,
  } as Omit<T, 'id'>;
}

/** Fields createEntityWithDefaults always writes, on top of the caller's data. */
export interface CreatedEntityFields {
  id: EARS.EntityId;
  entityType: EARS.Entity;
  shortCode: string;
  label: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * T is the caller's own attribute shape — it need not declare the fields this
 * function fills in (entityType, shortCode, label, timestamps); those are added
 * to the return type instead.
 */
export function createEntityWithDefaults<T extends Record<string, any> = Record<string, any>>(
  entityType: EARS.Entity,
  data: Partial<T>,
  prefix?: string,
  providedId?: EARS.EntityId,
): T & CreatedEntityFields {
  const ts = getTimestamp();
  const shortCode = data.shortCode || generateShortCode(entityType, prefix || entityType.substring(0, 3).toUpperCase());
  const label = data.label || generateLabelWithCount(`New ${entityType}`, entityType);

  const entity: Omit<T, 'id'> = {
    ...data,
    entityType,
    shortCode,
    label,
    createdAt: ts,
    updatedAt: ts,
  } as Omit<T, 'id'>;

  const id = providedId
    ? tx(providedId, true).batchPut(entity).id()
    : tx(entityType).batchPut(entity).id();

  return { ...entity, id } as unknown as T & CreatedEntityFields;
}

export function updateEntity(
  id: EARS.EntityId,
  updates: Record<string, any>,
  skipTimestamp?: boolean
): void {
  const transaction = tx(id);

  if (!skipTimestamp) {
    transaction.merge('updatedAt', getTimestamp());
  }

  Object.entries(updates).forEach(([key, value]) => {
    if (value === undefined) return;
    if (value === null) {
      transaction.drop(EARS.AttrKind.Custom(key));
    } else if (Array.isArray(value)) {
      transaction.drop(EARS.AttrKind.Custom(key));
      transaction.put(key, value);
    } else {
      transaction.update(EARS.AttrKind.Custom(key), value);
    }
  });
}

export function createRelation(
  sourceId: EARS.EntityId,
  relationType: EARS.RelKind,
  targetId: EARS.EntityId
): void {
  tx(sourceId).link(relationType, targetId);
}

export function removeRelation(
  sourceId: EARS.EntityId,
  relationType: EARS.RelKind,
  targetId?: EARS.EntityId
): void {
  if (targetId) {
    tx(sourceId).unlinkIf(relationType, targetId);
  } else {
    tx(sourceId).unlinkIf(relationType);
  }
}

export function grantRole(entityId: EARS.EntityId, role: string): void {
  tx(entityId).grant(role);
}

export function revokeRole(entityId: EARS.EntityId, role: string): void {
  tx(entityId).revoke(role);
}
