import { rows } from ".";
import { tx } from "@/shared/ears/helpers/transaction";
import { EARS } from "@/shared/ears/types";
import { createLogger } from '@/shared/debug/logger';

const logger = createLogger('load-initial-data');

/**
 * Load mock data into the store
 */
export function loadMockData(): void {
  const { entity = [], relation = [], role = [] } = rows;

  if (!entity.length) {
    logger.warn("No entities found in mock data");
    return;
  }

  // Keep track of the real IDs we just "touched"
  const entityIds: Record<string, EARS.EntityId> = {};

  /*──────────────────────────*
   * 1 ▸ Spawn all entities   *
   *──────────────────────────*/
  for (const row of entity) {
    const { id, entityType, createdAt, ...attrs } = row as any;

    // Start a tx on the given ID and set its timestamp
    const builder = tx(id as EARS.EntityId).put("timestamp", createdAt);

    // Add every other attribute
    for (const [key, value] of Object.entries(attrs)) {
      if (key === "id" || key === "entityType")
        continue;
      builder.put(key, value);
    }

    // Finalize (builder.id() === id itself)
    entityIds[id] = builder.id();
  }

  /*──────────────────────────*
   * 2 ▸ Create relations     *
   *──────────────────────────*/
  for (const rel of relation) {
    const src = entityIds[rel.source];
    const tgt = entityIds[rel.target];
    if (src && tgt) {
      tx(src).link(rel.kind, tgt, rel.info);
    }
  }

  /*──────────────────────────*
   * 3 ▸ Assign roles         *
   *──────────────────────────*/
  for (const assignment of role) {
    const eid = entityIds[assignment.entityId];
    if (eid) {
      tx(eid).grant(assignment.role);
    }
  }
}