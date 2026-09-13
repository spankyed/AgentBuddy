import type { EARS } from '../types/entities.ts';

interface DirectionLists {
  [entityId: string]: EARS.EntityId[];
}

interface RelationIndexEntry {
  bySource: DirectionLists;
  byTarget: DirectionLists;
}

export const relationIndex: Record<string, RelationIndexEntry> = {};

export function clearRelationIndex() {
  Object.keys(relationIndex).forEach(key => delete relationIndex[key]);
}

const ensureEntry = (kind: string): RelationIndexEntry => {
  if (!relationIndex[kind]) relationIndex[kind] = { bySource: {}, byTarget: {} };
  return relationIndex[kind];
};

export function addToIndex(
  kind: string,
  source: EARS.EntityId,
  target: EARS.EntityId,
  relId: EARS.EntityId,
): void {
  const e = ensureEntry(kind);
  if (!e.bySource[source]) e.bySource[source] = [];
  if (!e.byTarget[target]) e.byTarget[target] = [];
  if (!e.bySource[source].includes(relId)) e.bySource[source].push(relId);
  if (!e.byTarget[target].includes(relId)) e.byTarget[target].push(relId);
}

export function removeFromIndex(
  kind: string,
  source: EARS.EntityId,
  target: EARS.EntityId,
  relId: EARS.EntityId,
): void {
  const e = relationIndex[kind];
  if (!e) return;
  if (e.bySource[source]) e.bySource[source] = e.bySource[source].filter((id) => id !== relId);
  if (e.byTarget[target]) e.byTarget[target] = e.byTarget[target].filter((id) => id !== relId);
  if (e.bySource[source]?.length === 0) delete e.bySource[source];
  if (e.byTarget[target]?.length === 0) delete e.byTarget[target];
  if (Object.keys(e.bySource).length === 0 && Object.keys(e.byTarget).length === 0) {
    delete relationIndex[kind];
  }
}

export function updateIndex(
  kind: string,
  relId: EARS.EntityId,
  oldSource: EARS.EntityId,
  oldTarget: EARS.EntityId,
  newSource?: EARS.EntityId,
  newTarget?: EARS.EntityId,
): void {
  const finalSource = newSource ?? oldSource;
  const finalTarget = newTarget ?? oldTarget;
  if (finalSource === oldSource && finalTarget === oldTarget) return;
  removeFromIndex(kind, oldSource, oldTarget, relId);
  addToIndex(kind, finalSource, finalTarget, relId);
}
