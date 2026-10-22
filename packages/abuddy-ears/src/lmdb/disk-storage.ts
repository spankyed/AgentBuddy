// SPIKE: an engine storage that keeps no data in memory. Every read goes to LMDB, every write commits
// synchronously (one LMDB write transaction per storage call, or one for a whole `batch(fn)`).
//
// Key schema (one LMDB database, ordered-binary array keys, msgpack values):
//   ['v', id, kind]            -> the attribute's whole value list          (id, kind): getAttr/getAttrs/getAll
//   ['k', kind, id]            -> the list's length                          (kind, id): attribute stats
//   ['x', kind, value, id]     -> null   (primitive values only)             value index: where(k, v), withRole
//   ['e', type, seq]           -> id                                         entity index in insertion order
//   ['i', id]                  -> seq                                        entity membership (hasEntity)
//   ['T', seq] / ['t', type]   -> type / seq                                 entity types in first-seen order
//   ['AK', seq] / ['ak', kind] -> kind / seq                                 attribute kinds in first-seen order
//   ['s', kind, src, seq]      -> [relId, tgt]                               relations by source, in link order
//   ['g', kind, tgt, seq]      -> [relId, src]                               relations by target, in link order
//                                 (the other end is in the value, so a hop doesn't read the relation's details)
//   ['rx', kind, relId]        -> seq                                        a relation's index sequence
//   ['RK', seq] / ['rk', kind] -> kind / seq                                 relation kinds in first-seen order
//   ['m', 'seq']               -> the last sequence number
// A relation's details stay the `relationDetails` attribute of its id (['v', relId, 'relationDetails']).
// Sequence numbers keep the in-memory engine's insertion orders, which the contract specs pin.
import type { Database } from 'lmdb';
import { EARS } from '../entities.ts';
import { isPlainObject } from '../utils.ts';
import { noopSink, type PersistenceSink } from '../runtime.ts';
import { createEntity, type AttributeStorage } from '../attribute-storage.ts';
import type { RelationIndex, RelationIndexReader, RelationIndexStore } from '../relation-index.ts';
import type { QueryStorage } from '../query.ts';

type Id = EARS.EntityId;
type Key = Array<string | number | boolean>;
/** An index entry's value: the relation and its other end */
type Pair = [relId: Id, other: Id];
// Sorts after every id, kind and number in ordered-binary
const HI = '￿';

const entType = (id: Id) => {
  const dash = id.indexOf('-');
  return dash === -1 ? id as unknown as EARS.Entity : id.substring(0, dash) as EARS.Entity;
};

export interface DiskStorageOptions {
  /** The database the engine owns (ordered-binary keys, the default) */
  db: Database<any, Key>;
  /** Told of every write, like the memory engine's sink (optional here: the database is the store) */
  persistence?: PersistenceSink;
  /** Index primitive attribute values for where(k, v) and withRole (default true) */
  valueIndex?: boolean;
  /** How many ids a query filter needs before it uses the value index */
  indexThreshold?: number;
}

export type DiskStorage = QueryStorage & {
  /** Runs `fn` in one write transaction; storage writes inside it join it */
  batch<T>(fn: () => T): T;
  relations: RelationIndexStore;
};

export function createDiskStorage({ db, persistence = noopSink, valueIndex = true, indexThreshold }: DiskStorageOptions): DiskStorage {
  let removals = 0;
  let depth = 0;
  let seq: number = db.get(['m', 'seq']) ?? 0;

  /** One write transaction per outermost call. lmdb-js hangs on close after a nested transactionSync, so nesting is counted here */
  const write = <T>(fn: () => T): T => {
    if (depth > 0) return fn();
    depth++;
    try {
      return db.transactionSync(fn);
    } finally {
      depth--;
    }
  };

  const nextSeq = () => {
    seq++;
    db.put(['m', 'seq'], seq);
    return seq;
  };

  const range = (prefix: Key) => db.getRange({ start: prefix, end: [...prefix, HI] });
  const values = <T>(prefix: Key): T[] => [...range(prefix).map(({ value }) => value as T)];
  const keys = (prefix: Key): Key[] => [...db.getKeys({ start: prefix, end: [...prefix, HI] })] as Key[];
  const anyKey = (prefix: Key) => {
    for (const _ of db.getKeys({ start: prefix, end: [...prefix, HI], limit: 1 })) return true;
    return false;
  };
  const has = (key: Key) => db.get(key) !== undefined;

  // ── entity index ────────────────────────────────────────────────────────
  const indexEntity = (id: Id) => {
    if (has(['i', id])) return;
    const type = entType(id);
    const s = nextSeq();
    if (!has(['t', type])) {
      db.put(['t', type], s);
      db.put(['T', s], type);
    }
    db.put(['e', type, s], id);
    db.put(['i', id], s);
  };

  const unindexEntity = (id: Id) => {
    const s = db.get(['i', id]) as number | undefined;
    if (s === undefined) return;
    const type = entType(id);
    db.remove(['e', type, s]);
    db.remove(['i', id]);
    if (!anyKey(['e', type])) {
      const ts = db.get(['t', type]) as number;
      db.remove(['t', type]);
      db.remove(['T', ts]);
    }
  };

  const registerKind = (kind: EARS.AttrKind) => {
    if (has(['ak', kind])) return;
    const s = nextSeq();
    db.put(['ak', kind], s);
    db.put(['AK', s], kind);
  };

  // ── values ──────────────────────────────────────────────────────────────
  const valueKey = (v: unknown): string | number | boolean | undefined => {
    if (typeof v === 'string') return v.length <= 256 ? v : undefined;
    if (typeof v === 'number') return Number.isFinite(v) && !Object.is(v, -0) ? v : undefined;
    if (typeof v === 'boolean') return v;
    return undefined;
  };
  const valueKeys = (list: readonly unknown[] | undefined) => {
    const out = new Set<string | number | boolean>();
    if (list) for (const v of list) {
      const k = valueKey(v);
      if (k !== undefined) out.add(k);
    }
    return out;
  };
  const reindex = (id: Id, kind: EARS.AttrKind, prev: readonly unknown[] | undefined, next: readonly unknown[] | undefined) => {
    if (!valueIndex) return;
    const before = valueKeys(prev);
    const after = valueKeys(next);
    for (const k of before) if (!after.has(k)) db.remove(['x', kind, k, id]);
    for (const k of after) if (!before.has(k)) db.put(['x', kind, k, id], null);
  };

  const readList = (id: Id, kind: EARS.AttrKind) => db.get(['v', id, kind]) as EARS.AttributeValue[] | undefined;

  const writeList = (id: Id, kind: EARS.AttrKind, next: unknown[], prev: unknown[] | undefined) => {
    registerKind(kind);
    indexEntity(id);
    db.put(['v', id, kind], next);
    if (prev?.length !== next.length) db.put(['k', kind, id], next.length);
    reindex(id, kind, prev, next);
  };

  const deleteList = (id: Id, kind: EARS.AttrKind, prev: unknown[] | undefined) => {
    db.remove(['v', id, kind]);
    db.remove(['k', kind, id]);
    reindex(id, kind, prev, undefined);
  };

  const mergeAt = (list: unknown[], val: unknown, idx: number) => {
    while (list.length < idx) list.push(null);
    const cur = list[idx];
    list[idx] = cur && isPlainObject(cur) && isPlainObject(val) ? { ...cur, ...val } : val;
  };

  const add = (id: Id, kind: EARS.AttrKind, val: unknown) => write(() => {
    const prev = readList(id, kind);
    const list = prev ? [...prev, val] : [val];
    writeList(id, kind, list, prev);
    persistence.onPutAttrArray(kind, id, list);
  });

  const put = (id: Id, kind: EARS.AttrKind, val: unknown) => write(() => {
    const prev = valueIndex ? readList(id, kind) : undefined;
    const list = [val];
    // Without a value index the previous length is unknown: write the length every time
    writeList(id, kind, list, valueIndex ? prev : undefined);
    persistence.onPutAttrArray(kind, id, list);
  });

  const merge = (id: Id, kind: EARS.AttrKind, val: unknown, idx = 0) => write(() => {
    const prev = readList(id, kind);
    const list: unknown[] = prev ? [...prev] : [];
    mergeAt(list, val, idx);
    writeList(id, kind, list, prev);
    persistence.onPutAttrArray(kind, id, list);
  });

  const drop = (id: Id, kind: EARS.AttrKind, idx = 0) => write(() => {
    const prev = readList(id, kind);
    if (!prev?.length) return;
    const list = [...prev];
    list.splice(idx, 1);
    if (!list.length) {
      deleteList(id, kind, prev);
      persistence.onDropAttr(kind, id, idx, []);
    } else {
      writeList(id, kind, list, prev);
      persistence.onPutAttrArray(kind, id, list);
    }
  });

  const dropIf = (id: Id, kind: EARS.AttrKind, crit: unknown) => write(() => {
    const list = readList(id, kind);
    if (!list) return;
    const i = list.findIndex(
      v =>
        v === crit ||
        (isPlainObject(v) &&
          isPlainObject(crit) &&
          Object.entries(crit).every(([k, v0]) => (v as Record<string, unknown>)[k] === v0)),
    );
    if (i !== -1) drop(id, kind, i);
  });

  const bulkLoadAttr = (id: Id, kind: EARS.AttrKind, val: unknown, idx = 0) => write(() => {
    const prev = readList(id, kind);
    const list: unknown[] = prev ? [...prev] : [];
    mergeAt(list, val, idx);
    writeList(id, kind, list, prev);
  });

  const getAttr = (id: Id, k: EARS.AttrKind, i = 0) => readList(id, k)?.[i] ?? null;
  const getAttrs = (id: Id, k: EARS.AttrKind) => readList(id, k) ?? [];
  const getRoles = (id: Id) => getAttrs(id, EARS.AttrKind.Role) as string[];

  const getAll = (id: Id) => {
    const out: Record<string, unknown> = {};
    for (const { key, value } of range(['v', id])) {
      const list = value as unknown[];
      out[key[2] as string] = list.length === 1 ? list[0] : list;
    }
    return out;
  };

  const getAllEntityTypes = () => values<EARS.Entity>(['T']);
  const getEntitiesOfType = (t: EARS.Entity) => values<Id>(['e', t]);
  const getAllEntities = () => getAllEntityTypes().flatMap(getEntitiesOfType);
  const hasEntity = (id: Id) => has(['i', id]);

  const idsWithValue = (kind: EARS.AttrKind, v: unknown): ReadonlySet<Id> | undefined => {
    if (!valueIndex) return undefined;
    const k = valueKey(v);
    if (k === undefined) return undefined;
    const out = new Set<Id>();
    for (const key of db.getKeys({ start: ['x', kind, k], end: ['x', kind, k, HI] })) out.add((key as Key)[3] as Id);
    return out;
  };

  const grantRole = (id: Id, role: string) => add(id, EARS.AttrKind.Role, role);
  const revokeRole = (id: Id, role: string) => dropIf(id, EARS.AttrKind.Role, role);

  const queryEntitiesByRole = (role: string) => {
    const hit = idsWithValue(EARS.AttrKind.Role, role);
    return getAllEntities().filter(hit ? (id => hit.has(id)) : (id => getRoles(id).includes(role)));
  };

  const queryEntitiesByAttribute = (k: EARS.AttrKind, v?: unknown) => {
    if (v === undefined) {
      const holders = new Set(keys(['k', k]).map(key => key[2] as Id));
      return getAllEntities().filter(id => holders.has(id));
    }
    const hit = idsWithValue(k, v);
    return getAllEntities().filter(hit ? (id => hit.has(id)) : (id => getAttrs(id, k).some(attr => attr === v)));
  };

  // ── relation index ──────────────────────────────────────────────────────
  const reader: RelationIndexReader = {
    kinds: () => values<string>(['RK']),
    has: (kind) => has(['rk', kind]),
    bySource: (kind, id) => values<Pair>(['s', kind, id]).map(p => p[0]),
    byTarget: (kind, id) => values<Pair>(['g', kind, id]).map(p => p[0]),
    all: (kind) => values<Pair>(['s', kind]).map(p => p[0]),
    stats: (kind) => {
      const ids = new Set<Id>();
      const sources = new Set<string>();
      const targets = new Set<string>();
      for (const { key, value } of range(['s', kind])) {
        ids.add((value as Pair)[0]);
        sources.add(key[2] as string);
      }
      for (const key of db.getKeys({ start: ['g', kind], end: ['g', kind, HI] })) targets.add((key as Key)[2] as string);
      return { total: ids.size, uniqueSources: sources.size, uniqueTargets: targets.size };
    },
  };

  const addToIndex = (kind: string, source: Id, target: Id, relId: Id) => write(() => {
    if (!has(['rk', kind])) {
      const s = nextSeq();
      db.put(['rk', kind], s);
      db.put(['RK', s], kind);
    }
    let s = db.get(['rx', kind, relId]) as number | undefined;
    if (s === undefined) {
      s = nextSeq();
      db.put(['rx', kind, relId], s);
    }
    db.put(['s', kind, source, s], [relId, target]);
    db.put(['g', kind, target, s], [relId, source]);
  });

  const removeFromIndex = (kind: string, source: Id, target: Id, relId: Id) => write(() => {
    const s = db.get(['rx', kind, relId]) as number | undefined;
    if (s === undefined) return;
    db.remove(['s', kind, source, s]);
    db.remove(['g', kind, target, s]);
    db.remove(['rx', kind, relId]);
    if (!anyKey(['s', kind]) && !anyKey(['g', kind])) {
      const ks = db.get(['rk', kind]) as number;
      db.remove(['rk', kind]);
      db.remove(['RK', ks]);
    }
  });

  const updateIndex = (kind: string, relId: Id, oldSource: Id, oldTarget: Id, newSource?: Id, newTarget?: Id) => {
    const finalSource = newSource ?? oldSource;
    const finalTarget = newTarget ?? oldTarget;
    if (finalSource === oldSource && finalTarget === oldTarget) return;
    write(() => {
      removeFromIndex(kind, oldSource, oldTarget, relId);
      addToIndex(kind, finalSource, finalTarget, relId);
    });
  };

  /** The whole index as the memory engine's object (admin and tests only: it reads every relation) */
  const materialize = (): RelationIndex => {
    const out: RelationIndex = {};
    for (const kind of reader.kinds()) {
      const entry = out[kind] = { bySource: {} as Record<string, Id[]>, byTarget: {} as Record<string, Id[]> };
      for (const { key, value } of range(['s', kind])) (entry.bySource[key[2] as string] ??= []).push((value as Pair)[0]);
      for (const { key, value } of range(['g', kind])) (entry.byTarget[key[2] as string] ??= []).push((value as Pair)[0]);
    }
    return out;
  };

  function clear() {
    removals++;
    db.clearSync();
    seq = 0;
  }

  const relations: RelationIndexStore = {
    get index() { return materialize(); },
    reader,
    clear,
    addToIndex,
    removeFromIndex,
    updateIndex,
  };

  // ── relations ───────────────────────────────────────────────────────────
  const details = (relId: Id) => getAttr(relId, EARS.AttrKind.RelationDetails) as EARS.RelationDetail | null;

  const addRelation = (src: Id, kind: string, tgt: Id, info?: unknown) => write(() => {
    if (reader.has(kind)) {
      const fromTarget = new Set(reader.byTarget(kind, tgt));
      for (const existingRelId of reader.bySource(kind, src)) {
        if (fromTarget.has(existingRelId)) {
          const existingRel = details(existingRelId)!;
          if (info === undefined || JSON.stringify(existingRel.info) === JSON.stringify(info)) {
            console.warn(`[Relation] Duplicate relation link attempted (${kind}) between ${src} and ${tgt}. Reusing existing relation.`);
            return existingRelId;
          }
        }
      }
    }
    const relId = createEntity(EARS.Entity.Relation);
    put(relId, EARS.AttrKind.RelationDetails, { sourceEntity: src, targetEntity: tgt, relationType: kind, info } as EARS.RelationDetail);
    addToIndex(kind, src, tgt, relId);
    persistence.onAddRelation(relId, kind, src, tgt, info);
    return relId;
  });

  const updateRelation = (relId: Id, newS?: Id, newT?: Id, info?: unknown) => write(() => {
    const d = details(relId);
    if (!d) return;
    const { sourceEntity: oS, targetEntity: oT, relationType: k } = d;
    if (newS) d.sourceEntity = newS;
    if (newT) d.targetEntity = newT;
    if (info !== undefined) d.info = info;
    merge(relId, EARS.AttrKind.RelationDetails, d);
    if (newS || newT) updateIndex(k, relId, oS, oT, d.sourceEntity, d.targetEntity);
    const patch: { src?: string; tgt?: string; info?: unknown } = {};
    if (newS) patch.src = newS;
    if (newT) patch.tgt = newT;
    if (info !== undefined) patch.info = info;
    persistence.onUpdateRelation(relId, patch);
  });

  const removeRelation = (relId: Id, destroyed?: Id) => write(() => {
    const d = details(relId);
    if (d) removeFromIndex(d.relationType, d.sourceEntity, d.targetEntity, relId);
    drop(relId, EARS.AttrKind.RelationDetails);
    if (destroyed) persistence.onRemoveRelation(relId, destroyed);
    else persistence.onRemoveRelation(relId);
  });
  const removeRelationById = (relId: Id) => removeRelation(relId);

  /** The other ends of the kind's relations from (or to) `id`, from the index alone */
  const ends = (kind: string, id: Id, asSource: boolean) =>
    values<Pair>([asSource ? 's' : 'g', kind, id]).map(p => p[1]);

  const queryEntitiesInRelationTo = (target: Id) => {
    const out = new Set<Id>();
    for (const k of reader.kinds()) {
      for (const other of ends(k, target, true)) out.add(other);
      for (const other of ends(k, target, false)) out.add(other);
    }
    return [...out];
  };

  const queryEntitiesByRelationTo = (relKind: string, id: Id, asSource = false) =>
    ends(relKind, id, asSource).filter(Boolean);

  function destroyEntity(id: Id, skipPersistence = false) {
    removals++;
    write(() => {
      for (const k of reader.kinds()) {
        const relIds = [...reader.bySource(k, id), ...reader.byTarget(k, id)];
        for (const relId of relIds) removeRelation(relId, id);
        // Index entries left without details
        for (const prefix of [['s', k, id], ['g', k, id]] as Key[]) for (const key of keys(prefix)) db.remove(key);
      }
      for (const { key, value } of [...range(["v", id])]) deleteList(id, key[2] as EARS.AttrKind, value as unknown[]);
      unindexEntity(id);
      if (!skipPersistence) persistence.onDestroyEntity(id);
    });
  }

  const getAllAttributeKinds = () => values<EARS.AttrKind>(['AK']);
  const getAllRelationKinds = () => reader.kinds();

  const getAttributeStats = (kind: EARS.AttrKind) => {
    let entityCount = 0;
    let totalValues = 0;
    for (const { value } of range(['k', kind])) {
      entityCount++;
      totalValues += value as number;
    }
    return { entityCount, totalValues };
  };

  const entityCreated = (id: Id, entityType?: EARS.Entity) => persistence.onCreateEntity(id, entityType);

  function getSchemaStats() {
    const entities: Record<string, number> = {};
    for (const type of getAllEntityTypes()) entities[type] = keys(['e', type]).length;
    const attributes: Record<string, number> = {};
    for (const kind of getAllAttributeKinds()) attributes[kind] = getAttributeStats(kind).totalValues;
    const rels: Record<string, number> = {};
    for (const kind of reader.kinds()) rels[kind] = keys(['s', kind]).length;
    return { entities, attributes, relations: rels };
  }

  const storage: AttributeStorage = {
    clear, bulkLoadAttr,
    putAttr: put, addAttr: add, mergeAttr: merge, dropAttr: drop, dropIf, updateAttr: put,
    entityCreated, grantRole, revokeRole, addRelation, updateRelation, removeRelationById,
    getAttr, getAttrs, getRoles, getAll, getAllEntities, getEntitiesOfType, hasEntity, removals: () => removals,
    queryEntitiesByRole, queryEntitiesByAttribute, queryEntitiesInRelationTo, queryEntitiesByRelationTo,
    destroyEntity, getAllAttributeKinds, getAllRelationKinds, getAllEntityTypes, getAttributeStats, getSchemaStats,
  };

  return { ...storage, idsWithValue, indexThreshold, batch: write, relations };
}
