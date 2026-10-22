import type { EARS } from './entities.ts';

interface DirectionLists {
  [entityId: string]: EARS.EntityId[];
}

/** One relation kind's index: the relations of each source, and of each target */
export interface RelationIndexEntry {
  bySource: DirectionLists;
  byTarget: DirectionLists;
}

/** The relation index of an engine, by relation kind */
export type RelationIndex = Record<string, RelationIndexEntry>;

const NONE: readonly EARS.EntityId[] = Object.freeze([]);

/**
 * Reads of a relation index, whatever holds it (memory or disk). query.ts, edge-store.ts and relations.ts read
 * relations only through this, so an engine can swap where its index lives.
 */
export interface RelationIndexReader {
  /** The relation kinds with at least one relation, in the order they were first indexed */
  kinds(): string[];
  has(kind: string): boolean;
  /** The ids of the kind's relations from `id`, in the order they were indexed. Don't mutate */
  bySource(kind: string, id: EARS.EntityId): readonly EARS.EntityId[];
  /** The ids of the kind's relations to `id`, in the order they were indexed. Don't mutate */
  byTarget(kind: string, id: EARS.EntityId): readonly EARS.EntityId[];
  /** Every relation id of the kind (by source), possibly repeated */
  all(kind: string): EARS.EntityId[];
  /** Distinct relation ids, sources and targets of the kind */
  stats(kind: string): { total: number; uniqueSources: number; uniqueTargets: number };
}

/** An engine's relation index: its reads, its writes, and (for admin and tests) the index as an object */
export interface RelationIndexStore {
  readonly index: RelationIndex;
  readonly reader: RelationIndexReader;
  clear(): void;
  addToIndex(kind: string, source: EARS.EntityId, target: EARS.EntityId, relId: EARS.EntityId): void;
  removeFromIndex(kind: string, source: EARS.EntityId, target: EARS.EntityId, relId: EARS.EntityId): void;
  updateIndex(kind: string, relId: EARS.EntityId, oldSource: EARS.EntityId, oldTarget: EARS.EntityId, newSource?: EARS.EntityId, newTarget?: EARS.EntityId): void;
}

/** An engine's relation index and its writes */
export function createRelationIndex(): RelationIndexStore {
  const index: RelationIndex = {};

  const reader: RelationIndexReader = {
    kinds: () => Object.keys(index),
    has: (kind) => index[kind] !== undefined,
    bySource: (kind, id) => index[kind]?.bySource[id] ?? NONE,
    byTarget: (kind, id) => index[kind]?.byTarget[id] ?? NONE,
    all: (kind) => {
      const entry = index[kind];
      if (!entry) return [];
      const out: EARS.EntityId[] = [];
      for (const ids of Object.values(entry.bySource)) for (const id of ids) out.push(id);
      return out;
    },
    stats: (kind) => {
      const entry = index[kind];
      if (!entry) return { total: 0, uniqueSources: 0, uniqueTargets: 0 };
      const ids = new Set<string>();
      for (const relIds of Object.values(entry.bySource)) relIds.forEach((id) => ids.add(id));
      return { total: ids.size, uniqueSources: Object.keys(entry.bySource).length, uniqueTargets: Object.keys(entry.byTarget).length };
    },
  };

  function clear() {
    Object.keys(index).forEach(key => delete index[key]);
  }

  const ensureEntry = (kind: string): RelationIndexEntry => {
    if (!index[kind]) index[kind] = { bySource: {}, byTarget: {} };
    return index[kind];
  };

  function addToIndex(
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

  function removeFromIndex(
    kind: string,
    source: EARS.EntityId,
    target: EARS.EntityId,
    relId: EARS.EntityId,
  ): void {
    const e = index[kind];
    if (!e) return;
    if (e.bySource[source]) e.bySource[source] = e.bySource[source].filter((id) => id !== relId);
    if (e.byTarget[target]) e.byTarget[target] = e.byTarget[target].filter((id) => id !== relId);
    if (e.bySource[source]?.length === 0) delete e.bySource[source];
    if (e.byTarget[target]?.length === 0) delete e.byTarget[target];
    if (Object.keys(e.bySource).length === 0 && Object.keys(e.byTarget).length === 0) {
      delete index[kind];
    }
  }

  function updateIndex(
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

  return { index, reader, clear, addToIndex, removeFromIndex, updateIndex };
}
