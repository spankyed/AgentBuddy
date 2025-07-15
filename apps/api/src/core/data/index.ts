import { threadRows } from './mocks/threads';
import { flowRows } from './mocks/flows';
// import { brainRows } from './mock-data/brain';
import { promptRows } from './mocks/prompts';
import { actionRows } from './mocks/actions';
import { tx } from "@/core/utils/ears/helpers/transaction";
import { EARS } from "@/core/types";
import { createLogger } from '@/core/utils/debug/logger';
import { loadSnapshot as loadSnapshotFile, listSnapshots, restoreSnapshot, listGitSnapshots, loadGitSnapshot } from '@/systems/database/snapshot';

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

const logger = createLogger('load-data');

/**
 * Load mock data into the store
 */
export function loadData(r = rows): void {
  const { entity = [], relation = [], role = [] } = r;

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

/**
 * Load the latest snapshot if available
 * Checks runtime snapshots first, then falls back to Git snapshots
 */
export async function loadSnapshot(): Promise<void> {
  try {
    // First check for runtime snapshots
    const snapshots = await listSnapshots();
    if (snapshots.length > 0) {
      // Sort snapshots by timestamp (newest first)
      const sortedSnapshots = snapshots.sort((a, b) => b.localeCompare(a));
      const latestSnapshot = sortedSnapshots[0];
      
      logger.info(`Loading runtime snapshot: ${latestSnapshot}`);
      const snapshotData = await loadSnapshotFile(latestSnapshot);
      await restoreSnapshot(snapshotData);
      logger.info(`Snapshot loaded successfully. Restored ${snapshotData.metadata.entityCount} entities.`);
    } else {
      // Check for Git snapshots if no runtime snapshots exist
      const gitSnapshots = await listGitSnapshots();
      if (gitSnapshots.length > 0) {
        // Load the first available Git snapshot
        const gitSnapshot = gitSnapshots[0];
        logger.info(`Loading Git snapshot: ${gitSnapshot}`);
        const snapshotData = await loadGitSnapshot(gitSnapshot);
        await restoreSnapshot(snapshotData);
        logger.info(`Git snapshot loaded successfully. Restored ${snapshotData.metadata.entityCount} entities.`);
      } else {
        logger.info('No snapshots found. Starting with empty database.');
      }
    }
  } catch (error) {
    logger.error('Failed to load snapshot:', { error });
  }
}