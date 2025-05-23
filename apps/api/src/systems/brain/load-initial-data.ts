import { rows } from './mock-data';
import { tx } from '@/shared/ears/transaction';
import type { EARS } from '@/shared/ears/types';

/**
 * Load mock data from the new rows structure
 * - Entities, roles, and relations are loaded directly
 * - The latest message is identified and set
 */
export function loadMockData(): void {
  if (!rows.entity || rows.entity.length === 0) {
    console.warn('No entities found in mock data');
    return;
  }

  /*───────────────────────*
   * 1 ▸ Spawn all entities *
   *───────────────────────*/
  const entityIds: Record<string, EARS.EntityId> = {};

  for (const entity of rows.entity) {
    // Extract core entity properties
    const { id, entityType, createdAt, ...attributes } = entity;
    
    // Create entity using tx helper
    const txBuilder = tx(id as EARS.EntityId)
      .set('timestamp', createdAt);
    
    // Add all other attributes to the entity
    for (const [key, value] of Object.entries(attributes)) {
      if (key !== 'id' && key !== 'entityType' && key !== 'createdAt') {
        txBuilder.set(key, value);
      }
    }
    
    // Create the entity and store its ID for reference
    const entityId = txBuilder.id();
    entityIds[id] = entityId;
  }

  /*───────────────────────*
   * 2 ▸ Create relations   *
   *───────────────────────*/
  if (rows.relation) {
    for (const relation of rows.relation) {
      const { srcId, kind, tgtId } = relation;
      
      // Only create relations if both source and target entities exist
      if (entityIds[srcId] && entityIds[tgtId]) {
        tx(entityIds[srcId])
          .rel(kind, entityIds[tgtId])
          .id();
      }
    }
  }

  /*───────────────────────*
   * 3 ▸ Assign roles       *
   *───────────────────────*/
  if (rows.role) {
    for (const roleAssignment of rows.role) {
      const { entityId, role } = roleAssignment;
      
      if (entityIds[entityId]) {
        tx(entityIds[entityId])
          .role(role)
          .id();
      }
    }
  }
}