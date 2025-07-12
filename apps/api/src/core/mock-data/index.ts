import { threadRows } from './threads';
import { flowRows } from './flows';
// import { brainRows } from './mock-data/brain';
import { promptRows } from './prompts';
import { actionRows } from './actions';
import { tx } from "@/core/utils/ears/helpers/transaction";
import { EARS } from "@/core/utils/ears/types";
import { createLogger } from '@/core/utils/debug/logger';

import { FlowEntity, NodeEntity, TNodeEntity } from "@/types";
import { MessageEntity, ThreadEntity, ContextItemEntity, CanvasContentEntity, TagEntity } from "@/systems/threads/types";
import { PromptEntity } from "@/systems/prompts/types";
import { ActionEntity } from "@/systems/actions/types";

// ! remove after move from mock-data
type Entity =
  MessageEntity
  | ThreadEntity
  | ContextItemEntity
  | CanvasContentEntity
  | TagEntity
  | FlowEntity
  | NodeEntity
  | TNodeEntity
  | PromptEntity
  | ActionEntity

export const rows: Rows = composeData([
  threadRows,
  flowRows,
  promptRows,
  actionRows,
  // brainRows,
]);

export function composeData(sources: Partial<Rows>[]) {
  return sources.reduce<Rows>(
    (acc, source) => ({
      entity: [...acc.entity, ...(source.entity || [])],
      role: [...acc.role, ...(source.role || [])],
      relation: [...acc.relation, ...(source.relation || [])],
    }),
    { entity: [], role: [], relation: [] }
  );
}

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

export interface Rows {
  entity: Entity[];
  role: RoleAssignment[];
  relation: Relation[];
}
interface RoleAssignment {
  entityId: string;
  role: EARS.RoleKind;
}
interface Relation {
  source: string;
  kind: EARS.RelKind;
  target: string;
  info?: { [key: string]: any; }
}