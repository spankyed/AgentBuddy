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
