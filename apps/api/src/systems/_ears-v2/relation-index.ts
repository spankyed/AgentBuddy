/*───────────────────────────────────────────────────────────────────────────
 * relation-index.ts – Set‑backed indices for O(1) mutation
 *───────────────────────────────────────────────────────────────────────────*/
import type { ECS } from "./types";

export type RelationKind = string;

type DirectionIndex = Record<ECS.EntityId, Set<ECS.EntityId>>;

interface RelationIndexEntry {
  bySource: DirectionIndex;
  byTarget: DirectionIndex;
}

/** Global relation lookup: `relationIndex[kind].bySource[src] -> Set<relId>` */
export const relationIndex: Record<RelationKind, RelationIndexEntry> = {};

/* helper */
const ensureEntry = (kind: RelationKind): RelationIndexEntry => {
  if (!relationIndex[kind]) {
    relationIndex[kind] = { bySource: {}, byTarget: {} };
  }
  return relationIndex[kind];
};

/*───────────────────────────────────────────────────────────────────────────*
 * 1 ▸ addToIndex
 *───────────────────────────────────────────────────────────────────────────*/
export const addToIndex = (
  kind: RelationKind,
  source: ECS.EntityId,
  target: ECS.EntityId,
  relationId: ECS.EntityId,
): void => {
  const entry = ensureEntry(kind);
  if (!entry.bySource[source]) entry.bySource[source] = new Set();
  if (!entry.byTarget[target]) entry.byTarget[target] = new Set();
  entry.bySource[source].add(relationId);
  entry.byTarget[target].add(relationId);
};

/*───────────────────────────────────────────────────────────────────────────*
 * 2 ▸ removeFromIndex
 *───────────────────────────────────────────────────────────────────────────*/
export const removeFromIndex = (
  kind: RelationKind,
  source: ECS.EntityId,
  target: ECS.EntityId,
  relationId: ECS.EntityId,
): void => {
  const entry = relationIndex[kind];
  if (!entry) return;
  entry.bySource[source]?.delete(relationId);
  if (entry.bySource[source]?.size === 0) delete entry.bySource[source];
  entry.byTarget[target]?.delete(relationId);
  if (entry.byTarget[target]?.size === 0) delete entry.byTarget[target];
  if (
    Object.keys(entry.bySource).length === 0 &&
    Object.keys(entry.byTarget).length === 0
  ) {
    delete relationIndex[kind];
  }
};

/*───────────────────────────────────────────────────────────────────────────*
 * 3 ▸ updateIndex – single remove → single add to avoid dupes
 *───────────────────────────────────────────────────────────────────────────*/
export const updateIndex = (
  kind: RelationKind,
  relationId: ECS.EntityId,
  oldSource: ECS.EntityId,
  oldTarget: ECS.EntityId,
  newSource?: ECS.EntityId,
  newTarget?: ECS.EntityId,
): void => {
  if (!newSource && !newTarget) return; // nothing changed
  removeFromIndex(kind, oldSource, oldTarget, relationId);
  addToIndex(kind, newSource ?? oldSource, newTarget ?? oldTarget, relationId);
};
