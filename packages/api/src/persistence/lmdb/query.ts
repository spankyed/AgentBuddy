// lmdb-query.ts
import type { LmdbDbs } from '@/persistence/lmdb/envs';
import { isDeepStrictEqual } from 'node:util';

const US = '\x1F';

export type AttrRecord = { t: 'null' | 'string' | 'number' | 'boolean' | 'object' | 'array' | 'date' | 'blob'; v: any };
export type EntityMeta = { type: string; createdAt: number; deletedAt?: number };
export type RelationRecord = { kind: string; src: string; tgt: string; info?: any; createdAt: number };

/**
 * Decode attribute record to its runtime value.
 * Handles Date deserialization and blob objects (stored as JSON).
 * Note: blob handling assumes JSON encoding stores objects like {b64:"..."}.
 * Update this when moving to binary encoding.
 */
export function decodeAttr(rec?: AttrRecord | null) {
  if (!rec) return null;
  return rec.t === 'date' && typeof rec.v === 'string' ? new Date(rec.v) : rec.v;
}

/**
 * Parse numeric index from key suffix, with guards against corrupt data.
 * Returns null if index is not a valid finite number >= 0.
 */
function toIndex(key: string, prefix: string): number | null {
  const idx = Number(key.slice(prefix.length));
  return Number.isFinite(idx) && idx >= 0 ? idx : null;
}

/**
 * Smart equality comparison with support for Dates and optional deep equality.
 */
function eq(a: unknown, b: unknown, deep = false): boolean {
  // Handle Date comparisons
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (a instanceof Date && typeof b === 'number') return a.getTime() === b;
  if (b instanceof Date && typeof a === 'number') return b.getTime() === a;
  
  // Optional deep equality for objects/arrays
  if (deep && a && b && typeof a === 'object' && typeof b === 'object') {
    return isDeepStrictEqual(a, b);
  }
  
  return a === b;
}

function attrKey(kind: string, entityId: string, idx: number) {
  return `${kind}${US}${entityId}${US}${idx}`;
}

function attrPrefix(kind: string, entityId: string) {
  const p = `${kind}${US}${entityId}${US}`;
  return { start: p, end: p + '\xFF', prefix: p };
}

function scanPrefix<T = any>(db: any, p: string) {
  // returns an iterable over { key, value }
  return db.getRange({ start: p, end: p + '\xFF' }) as Iterable<{ key: string | Buffer; value: T }>;
}

export type FindByAttrOpts = {
  /** optional: only return entities of this type (uses the entities DB) */
  entityType?: string;
  /** return at most N unique entityIds */
  limit?: number;
  /** shortcut equality check instead of predicate */
  equals?: unknown;
  /** opt-in deep equality for object/array comparisons */
  deepEquals?: boolean;
  /** custom predicate (value, idx, entityId) -> boolean */
  predicate?: (value: unknown, idx: number, entityId: string) => boolean;
};

export class LmdbQuery {
  constructor(private dbs: LmdbDbs) { }

  // ───────────────────────────── Attributes ─────────────────────────────

  /** Get a single attribute value by (kind, entityId, idx) */
  getAttr(kind: string, entityId: string, idx = 0): unknown {
    const rec = this.dbs.attrs.get(attrKey(kind, entityId, idx)) as AttrRecord | undefined;
    return decodeAttr(rec ?? null);
  }

  /** Get the first attribute value for (kind, entityId) - fast path without range scan */
  getFirstAttr(kind: string, entityId: string): unknown {
    return this.getAttr(kind, entityId, 0);
  }

  /** Count attributes without materializing the array */
  getAttrCount(kind: string, entityId: string): number {
    const { start, end } = attrPrefix(kind, entityId);
    let count = 0;
    for (const _ of this.dbs.attrs.getRange({ start, end })) {
      count++;
    }
    return count;
  }

  /** Get the entire attribute array for (kind, entityId) */
  getAttrArray(kind: string, entityId: string): unknown[] {
    const { prefix, start, end } = attrPrefix(kind, entityId);
    const out: unknown[] = [];
    for (const { key, value } of this.dbs.attrs.getRange({ start, end })) {
      const idx = toIndex(String(key), prefix);
      if (idx === null) continue; // skip corrupt/out-of-format rows
      out[idx] = decodeAttr(value as AttrRecord);
    }
    // normalize holes to nulls for parity with your in-memory representation
    for (let i = 0; i < out.length; i++) if (out[i] === undefined) out[i] = null;
    return out;
  }

  /** Iterate all (idx, value) pairs for (kind, entityId) without building an array */
  *iterAttr(kind: string, entityId: string): Iterable<{ idx: number; value: unknown }> {
    const { prefix, start, end } = attrPrefix(kind, entityId);
    for (const { key, value } of this.dbs.attrs.getRange({ start, end })) {
      const idx = toIndex(String(key), prefix);
      if (idx === null) continue; // skip corrupt/out-of-format rows
      yield { idx, value: decodeAttr(value as AttrRecord) };
    }
  }

  /** List all entityIds that have *any* value for the given kind (across all entities) */
  *entitiesHavingAttr(kind: string, limit = Infinity): Iterable<string> {
    const seen = new Set<string>();
    let count = 0;
    const start = `${kind}${US}`, end = start + '\xFF';
    for (const { key } of this.dbs.attrs.getRange({ start, end })) {
      // key format: kind␟entityId␟idx
      // Note: assumes no US in entityId (validated upstream)
      const [, entityId] = String(key).split(US);
      if (!seen.has(entityId)) {
        seen.add(entityId);
        yield entityId;
        if (++count >= limit) break;
      }
    }
  }

  /**
   * Find entityIds by attribute content.
   * Scans all rows for a given kind and filters by equals/predicate and (optional) entityType.
   * Note: O(#rows for kind) - consider secondary indexes for hot queries.
   */
  findEntitiesByAttr(kind: string, opts: FindByAttrOpts = {}): string[] {
    const { entityType, equals, deepEquals = false, predicate, limit = Infinity } = opts;
    const out: string[] = [];
    const seen = new Set<string>();
    const typeCache = new Map<string, string | undefined>();

    const start = `${kind}${US}`, end = start + '\xFF';
    for (const { key, value } of this.dbs.attrs.getRange({ start, end })) {
      const rec = value as AttrRecord;
      const val = decodeAttr(rec);
      const parts = String(key).split(US); // [kind, entityId, idx]
      const entityId = parts[1];
      const idxStr = parts[2];
      const idx = Number(idxStr);
      
      // Skip if index is corrupt
      if (!Number.isFinite(idx) || idx < 0) continue;

      // optional value test
      const pass = equals !== undefined ? eq(val, equals, deepEquals)
                 : predicate ? !!predicate(val, idx, entityId)
                 : true;
      if (!pass) continue;

      // optional entity type check
      if (entityType) {
        let t = typeCache.get(entityId);
        if (t === undefined) {
          const meta = this.dbs.entities.get(entityId) as EntityMeta | undefined;
          t = meta?.deletedAt ? null as any : meta?.type;
          typeCache.set(entityId, t);
        }
        if (t !== entityType) continue;
      }

      if (!seen.has(entityId)) {
        seen.add(entityId);
        out.push(entityId);
        if (out.length >= limit) break;
      }
    }
    return out;
  }

  // ───────────────────────────── Entities ─────────────────────────────

  /** Iterate entityIds of a given type (skips deleted) */
  *entitiesOfType(type: string): Iterable<string> {
    for (const { key: entityId, value: meta } of this.dbs.entities.getRange() as Iterable<{ key: string; value: EntityMeta }>) {
      if (meta.type === type && !meta.deletedAt) yield String(entityId);
    }
  }

  /** Get entity meta (type, timestamps) */
  getEntityMeta(entityId: string): EntityMeta | null {
    return (this.dbs.entities.get(entityId) as EntityMeta | undefined) ?? null;
    // Note: if you rely on tombstones, check meta?.deletedAt before using.
  }

  // ───────────────────────────── Relations ─────────────────────────────

  /** 
   * Iterate relations meeting optional filters.
   * Note: O(R) fallback scan. Future optimization: add secondary indexes (relBySrc, relByTgt)
   * for O(1) prefix scans when neighbors/BFS become hot.
   */
  *relations(filter?: { kind?: string; src?: string; tgt?: string; skipDeleted?: boolean; limit?: number })
    : Iterable<{ relId: string; rel: RelationRecord }> {
    const { kind, src, tgt, skipDeleted = true, limit = Infinity } = filter ?? {};
    let count = 0;
    
    for (const { key, value } of this.dbs.relations.getRange() as Iterable<{ key: string; value: RelationRecord }>) {
      const rel = value;
      if (kind && rel.kind !== kind) continue;
      if (src && rel.src !== src) continue;
      if (tgt && rel.tgt !== tgt) continue;
      
      // Optional tombstone filtering
      if (skipDeleted) {
        const s = this.dbs.entities.get(rel.src) as EntityMeta | undefined;
        const t = this.dbs.entities.get(rel.tgt) as EntityMeta | undefined;
        if (s?.deletedAt || t?.deletedAt) continue;
      }
      
      yield { relId: String(key), rel };
      if (++count >= limit) break;
    }
  }

  /** 
   * Neighbors via relations: out / in / both.
   * Note: O(R) per call due to relation scan. Plan for secondary indexes if hot.
   */
  neighbors(id: string, opts?: { kind?: string; direction?: 'out' | 'in' | 'both'; skipDeleted?: boolean }): string[] {
    const kind = opts?.kind;
    const dir = opts?.direction ?? 'out';
    const skipDeleted = opts?.skipDeleted ?? true;
    const set = new Set<string>();

    if (dir === 'out' || dir === 'both') {
      for (const { rel } of this.relations({ kind, src: id, skipDeleted })) set.add(rel.tgt);
    }
    if (dir === 'in' || dir === 'both') {
      for (const { rel } of this.relations({ kind, tgt: id, skipDeleted })) set.add(rel.src);
    }
    return [...set];
  }

  /** 
   * Tiny BFS over relations.
   * Note: O(depth × R) due to neighbors() calls. Future: with secondary indexes, drops to O(edges on frontier).
   */
  bfs(startId: string, opts?: { maxDepth?: number; kind?: string; direction?: 'out' | 'in' | 'both'; skipDeleted?: boolean }) {
    const { maxDepth = 1, kind, direction = 'out', skipDeleted = true } = opts ?? {};
    const dist = new Map<string, number>();
    const q: string[] = [];

    dist.set(startId, 0);
    q.push(startId);

    while (q.length) {
      const cur = q.shift()!;
      const d = dist.get(cur)!;
      if (d >= maxDepth) continue;
      for (const n of this.neighbors(cur, { kind, direction, skipDeleted })) {
        if (!dist.has(n)) {
          dist.set(n, d + 1);
          q.push(n);
        }
      }
    }
    return dist; // includes startId at distance 0
  }

  // ───────────────────────────── Generic range util ─────────────────────────────

  /**
   * Scan a raw key range from any DB.
   * Example: scan all Tag rows for a specific entity with prefix "Tag␟Doc-1␟".
   */
  scan(dbName: keyof LmdbDbs, opts: { start: string; end: string; limit?: number; reverse?: boolean }) {
    const db = this.dbs[dbName] as any;
    return db.getRange(opts);
  }
}

/* Example usage
import { openEnvAt } from '@/persistence/lmdb/envs';
import { LmdbQuery } from './lmdb-query';

const dbs = openEnvAt('/path/to/ears.lmdb');
const q = new LmdbQuery(dbs);

// 1) Single attr
const title = q.getAttr('Name', 'Document-9f8e2c');  // "How to reset an iPhone 13?"

// 2) Whole attr array
const tags = q.getAttrArray('Tag', 'Document-9f8e2c'); // ["ios", "reset"]

// 3) Entities of a type
const documents = [...q.entitiesOfType('Document')];

// 4) Find docs with an exact tag
const docsWithIosTag = q.findEntitiesByAttr('Tag', { equals: 'ios', entityType: 'Document' });

// 5) Custom predicate: documents updated after a date
const recentDocs = q.findEntitiesByAttr('UpdatedAt', {
  predicate: (v) => v instanceof Date && v.getTime() >= Date.parse('2025-08-01'),
  entityType: 'Document',
});

// 6) Outgoing neighbors by relation kind
const containedDocs = q.neighbors('Collection-12ab34', { kind: 'CONTAINS', direction: 'out' });

// 7) BFS two hops via LINKS
const reach = q.bfs('Document-9f8e2c', { maxDepth: 2, kind: 'LINKS', direction: 'both' });
*/