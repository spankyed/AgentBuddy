/*─────────────────────────────────────────────────────────────
 * lmdb-reads.ts – LMDB-backed primitives for the USE_LMDB flag
 * in attribute-storage.ts. Higher-level queries (roles, relations,
 * etc.) compose on top of these via the gated exports.
 *─────────────────────────────────────────────────────────────*/
import { LmdbQuery } from '@/core/persistence/lmdb/query';
import { EARS } from '../types';
import type { LmdbDbs } from '@/core/persistence/lmdb/envs';

let q: LmdbQuery;

export function initLmdbReads(dbs: LmdbDbs) {
  q = new LmdbQuery(dbs);
}

export const lmdbGetAttr = (id: EARS.EntityId, k: EARS.AttrKind, i = 0): unknown =>
  q.getAttr(k, id, i);

export const lmdbGetAttrs = (id: EARS.EntityId, k: EARS.AttrKind): unknown[] =>
  q.getAttrArray(k, id);

export const lmdbGetAllEntities = (): EARS.EntityId[] => {
  const all: EARS.EntityId[] = [];
  for (const { key, value } of q.scan('entities', { start: '', end: '\xFF' })) {
    if (!value?.deletedAt) all.push(String(key) as EARS.EntityId);
  }
  return all;
};

export const lmdbGetEntitiesOfType = (t: EARS.Entity): EARS.EntityId[] =>
  [...q.entitiesOfType(t)] as EARS.EntityId[];

export const lmdbRelationIdsFor = (id: EARS.EntityId, kind: string, direction: 'out' | 'in'): EARS.EntityId[] =>
  q.relationIdsFor(id, kind, direction) as EARS.EntityId[];

export const lmdbRelationIdsForAll = (id: EARS.EntityId): EARS.EntityId[] =>
  q.relationIdsForAll(id) as EARS.EntityId[];

export const lmdbHasRelation = (src: EARS.EntityId, kind: string, tgt: EARS.EntityId): EARS.EntityId | null =>
  q.hasRelation(src, kind, tgt) as EARS.EntityId | null;

export const lmdbGetRelationStats = (kind: string): { totalRelations: number; uniqueSources: number; uniqueTargets: number } => {
  const US = '\x1F';
  const prefix = `${kind}${US}`;
  let srcCount = 0;
  let tgtCount = 0;
  const allRelIds = new Set<string>();
  for (const { key, value } of q.scan('relBySrc', { start: prefix, end: prefix + '\xFF' })) {
    srcCount++;
    if (Array.isArray(value)) for (const id of value) allRelIds.add(id);
  }
  for (const { key } of q.scan('relByTgt', { start: prefix, end: prefix + '\xFF' })) {
    tgtCount++;
  }
  return { totalRelations: allRelIds.size, uniqueSources: srcCount, uniqueTargets: tgtCount };
};

export const lmdbBuildTopology = (): Map<string, number> => {
  const edges = new Map<string, number>();
  for (const { value } of q.scan('relations', { start: '', end: '\xFF' })) {
    if (!value?.src || !value?.tgt || !value?.kind) continue;
    const srcType = value.src.split('-')[0];
    const tgtType = value.tgt.split('-')[0];
    const edgeKey = `${srcType} --${value.kind}--> ${tgtType}`;
    edges.set(edgeKey, (edges.get(edgeKey) ?? 0) + 1);
  }
  return edges;
};

export const lmdbGetAllRelationKinds = (): string[] => {
  const kinds = new Set<string>();
  for (const { value } of q.scan('relations', { start: '', end: '\xFF' })) {
    if (value?.kind) kinds.add(value.kind);
  }
  return [...kinds];
};

export const lmdbGetAllEntityTypes = (): EARS.Entity[] => {
  const types = new Set<EARS.Entity>();
  for (const { value } of q.scan('entities', { start: '', end: '\xFF' })) {
    if (value?.type && !value?.deletedAt) types.add(value.type as EARS.Entity);
  }
  return [...types];
};

export const lmdbGetAllAttributeKinds = (): EARS.AttrKind[] => {
  const US = '\x1F';
  const kinds = new Set<EARS.AttrKind>();
  for (const { key } of q.scan('attrs', { start: '', end: '\xFF' })) {
    const k = String(key);
    const i = k.indexOf(US);
    if (i > 0) kinds.add(k.substring(0, i) as EARS.AttrKind);
  }
  return [...kinds];
};

export const lmdbGetAll = (id: EARS.EntityId): Record<string, unknown> => {
  const US = '\x1F';
  const out: Record<string, unknown[]> = {};
  for (const { key } of q.scan('attrs', { start: '', end: '\xFF' })) {
    const k = String(key);
    const i = k.indexOf(US);
    const j = k.indexOf(US, i + 1);
    if (k.substring(i + 1, j) !== id) continue;
    const kind = k.substring(0, i);
    const idx = Number(k.substring(j + 1));
    if (!out[kind]) out[kind] = [];
    out[kind][idx] = q.getAttr(kind, id, idx);
  }
  const result: Record<string, unknown> = {};
  for (const [k, arr] of Object.entries(out))
    result[k] = arr.length === 1 ? arr[0] : arr;
  return result;
};
