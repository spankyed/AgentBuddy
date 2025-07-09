import { tx } from '@/shared/ears/helpers/transaction';
import { EARS } from '@/shared/ears/types';
import { getTimestamp, generateShortCode, generateLabelWithCount } from '@/shared/ears/helpers/entity-utils';

/**
 * Type-safe transaction helpers for common operations
 */

// Prepare entity with common fields
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

// Create entity with auto-generated fields
export function createEntityWithDefaults<T extends { 
  entityType: EARS.Entity;
  shortCode?: string;
  label?: string;
}>(
  entityType: EARS.Entity,
  data: Partial<T>,
  prefix?: string
): T & { id: EARS.EntityId } {
  const ts = getTimestamp();
  const shortCode = data.shortCode || generateShortCode(entityType, prefix);
  const label = data.label || generateLabelWithCount(`New ${entityType}`, entityType);
  
  const entity: Omit<T, 'id'> = {
    ...data,
    entityType,
    shortCode,
    label,
    createdAt: ts,
    updatedAt: ts,
  } as Omit<T, 'id'>;
  
  const id = tx(entityType)
    .batchPut(entity)
    .id();
    
  return { ...entity, id } as T & { id: EARS.EntityId };
}

// Update entity fields with timestamp
export function updateEntity(
  id: EARS.EntityId,
  updates: Record<string, any>
): void {
  const transaction = tx(id);
  
  // Always update timestamp
  transaction.merge('updatedAt', getTimestamp());
  
  // Update each field
  Object.entries(updates).forEach(([key, value]) => {
    if (value === undefined) {
      // Skip undefined values
      return;
    }
    
    if (value === null) {
      // Drop null values
      transaction.drop(EARS.AttrKind.Custom(key));
    } else if (Array.isArray(value)) {
      // Replace arrays entirely
      transaction.drop(EARS.AttrKind.Custom(key));
      transaction.put(key, value);
    } else {
      // Merge other values
      transaction.merge(key as any, value);
    }
  });
}

// Create relationship between entities
export function createRelation(
  sourceId: EARS.EntityId,
  relationType: EARS.RelKind,
  targetId: EARS.EntityId
): void {
  tx(sourceId).link(relationType, targetId);
}

// Remove relationship between entities
export function removeRelation(
  sourceId: EARS.EntityId,
  relationType: EARS.RelKind,
  targetId?: EARS.EntityId
): void {
  if (targetId) {
    tx(sourceId).unlink(relationType, targetId);
  } else {
    tx(sourceId).unlinkIf(relationType);
  }
}

// Grant role to entity
export function grantRole(
  entityId: EARS.EntityId,
  role: string
): void {
  tx(entityId).grant(role);
}

// Revoke role from entity
export function revokeRole(
  entityId: EARS.EntityId,
  role: string
): void {
  tx(entityId).revoke(role);
} 