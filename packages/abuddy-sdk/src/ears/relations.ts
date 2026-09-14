import { EARS } from '../types/entities.ts';
import { edgeStore } from './edge-store.ts';
import { relationIndex } from './relation-index.ts';
import { getAttr } from './attribute-storage.ts';

/** Which relations to match: any combination of source, relation kind and target */
export interface RelationMatch {
  sourceEntity?: EARS.EntityId;
  relationType?: EARS.RelKind;
  targetEntity?: EARS.EntityId;
}

/** A relation row: its id (what removeRelationById takes) and its details, including its info */
export interface RelationRow extends EARS.RelationDetail {
  id: EARS.EntityId;
}

/**
 * The relations matching `match`, with their ids and info (e.g. a flow edge's handles). An empty
 * match returns every relation. `qx(id).links(...)` returns linked ids; this returns the relations.
 */
export function findRelations(match: RelationMatch = {}): RelationRow[] {
  return edgeStore.relIds(match).flatMap((id) => {
    const detail = getAttr(id, EARS.AttrKind.RelationDetails) as EARS.RelationDetail | undefined;
    return detail ? [{ ...detail, id }] : [];
  });
}

/** Counts for one relation kind */
export interface RelationStats {
  /** Relations of the kind */
  total: number;
  /** Distinct entities that are a source of one */
  uniqueSources: number;
  /** Distinct entities that are a target of one */
  uniqueTargets: number;
}

/** How many relations of `kind` exist, and between how many distinct sources and targets */
export function getRelationStats(kind: EARS.RelKind): RelationStats {
  const entry = relationIndex[kind];
  if (!entry) return { total: 0, uniqueSources: 0, uniqueTargets: 0 };
  const ids = new Set<string>();
  for (const relIds of Object.values(entry.bySource)) relIds.forEach((id) => ids.add(id));
  return { total: ids.size, uniqueSources: Object.keys(entry.bySource).length, uniqueTargets: Object.keys(entry.byTarget).length };
}
