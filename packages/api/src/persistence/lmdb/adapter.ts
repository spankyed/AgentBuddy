import type { Dbs } from './env';
import type { PersistenceSink } from '../partitioning/base-sink';

type Encoded = { t: string; v: any };

function enc(value: unknown): Encoded {
  if (value instanceof Date) return { t: 'date', v: value.toISOString() };
  const t = value === null ? 'null'
    : Array.isArray(value) ? 'array'
    : typeof value === 'object' ? 'object'
    : typeof value; // string|number|boolean|undefined
  return { t, v: value };
}

// Use same separator throughout for consistency
const SEP = '\x1F';

function attrKey(kind: string, entityId: string, idx: number) {
  validateKey(kind, 'kind');
  validateKey(entityId, 'entityId');
  return `${kind}${SEP}${entityId}${SEP}${idx}`;
}

function validateKey(value: string, name: string) {
  if (value.includes(SEP)) {
    throw new Error(`Invalid ${name}: contains forbidden separator character \\x1F`);
  }
}

function prefix(kind: string, entityId: string) {
  const p = `${kind}${SEP}${entityId}${SEP}`;
  // End bound: any key with this prefix sorts before prefix+\xFF
  return { start: p, end: p + '\xFF' };
}

function arrayRewriteKey(kind: string, entityId: string) {
  return `${kind}${SEP}${entityId}`;
}

const entTypeOf = (id: string) => id.split('-')[0] ?? id;

// Error tracking
let errorCount = 0;
let lastError: { op: string; key?: string; error: any } | null = null;

export function makeLmdbAdapter(dbs: Dbs): PersistenceSink {
  const { entities, attrs, relations } = dbs;

  // Keyed buffers for coalescing writes
  const arrayRewrites = new Map<string, unknown[]>(); // kind\x1FentityId -> final array
  const ensureBuf = new Set<string>();
  const relUpserts = new Map<string, any>();
  const relDeletes = new Set<string>();
  const entityUpdates = new Map<string, any>();
  
  let scheduled = false;
  let closed = false;

  // Extract flush logic to reusable function
  function flushBody() {
    // Use single timestamp for consistency
    const ts = Date.now();
    
    // Ensure entities (check doesExist to preserve createdAt)
    for (const id of ensureBuf) {
      if (!entities.doesExist(id)) {
        entities.put(id, { type: entTypeOf(id), createdAt: ts });
      }
    }
    ensureBuf.clear();

    // Entity updates (preserve existing data)
    for (const [id, patch] of entityUpdates) {
      const existing = entities.get(id);
      if (existing) {
        entities.put(id, { ...existing, ...patch });
      } else {
        entities.put(id, { type: patch.type ?? entTypeOf(id), createdAt: ts, ...patch });
      }
    }
    entityUpdates.clear();

    // Array rewrites - atomic replacement of entire arrays
    for (const [key, arr] of arrayRewrites) {
      const [kind, entityId] = key.split(SEP);
      const { start, end } = prefix(kind, entityId);
      
      // Delete all existing keys for this (kind, entityId)
      for (const { key } of attrs.getRange({ start, end })) {
        attrs.remove(key);
      }
      
      // Write the new array
      for (let i = 0; i < arr.length; i++) {
        attrs.put(attrKey(kind, entityId, i), enc(arr[i]));
      }
    }
    arrayRewrites.clear();

    // Relation deletions
    for (const id of relDeletes) {
      relations.remove(id);
    }
    relDeletes.clear();

    // Relation upserts
    for (const [id, obj] of relUpserts) {
      relations.put(id, obj);
    }
    relUpserts.clear();
  }

  function scheduleFlush() {
    if (scheduled || closed) return;
    scheduled = true;
    queueMicrotask(() => {
      if (closed) return;
      scheduled = false;
      
      try {
        entities.transactionSync(() => {
          flushBody();
        });
      } catch (error) {
        errorCount++;
        lastError = {
          op: 'flush',
          error
        };
        console.error('[LMDB] Transaction failed:', error);
        console.error('[LMDB] Error count:', errorCount);
        // Clear buffers even on error to prevent infinite retries
        ensureBuf.clear();
        entityUpdates.clear();
        arrayRewrites.clear();
        relDeletes.clear();
        relUpserts.clear();
      }
    });
  }

  function bufferArrayRewrite(kind: string, entityId: string, array: unknown[]) {
    // Validate keys early to fail fast
    validateKey(kind, 'kind');
    validateKey(entityId, 'entityId');
    
    const key = arrayRewriteKey(kind, entityId);
    // Store only the final state of the array
    arrayRewrites.set(key, [...array]); // Clone to avoid mutations
    ensureBuf.add(entityId);
    scheduleFlush();
  }

  function close() {
    if (closed) return;
    closed = true;
    
    // Always flush whatever is in the buffers, regardless of scheduled state
    try {
      entities.transactionSync(() => {
        flushBody();
      });
    } catch (error) {
      console.error('[LMDB] Final flush failed:', error);
    } finally {
      // Clear all buffers
      ensureBuf.clear();
      entityUpdates.clear();
      arrayRewrites.clear();
      relDeletes.clear();
      relUpserts.clear();
    }
  }

  return {
    onCreateEntity(entityId: string, type?: string) {
      if (closed) return;
      ensureBuf.add(entityId);
      // If type is explicitly provided, store it for update
      if (type) {
        entityUpdates.set(entityId, { type });
      }
      scheduleFlush();
    },

    onDestroyEntity(entityId: string) {
      if (closed) return;
      // Mark entity as deleted with timestamp
      const ts = Date.now();
      entityUpdates.set(entityId, { deletedAt: ts });
      
      // Option B: Keep attrs/relations on disk, filter during hydration
      // This is cleaner and avoids the expensive scan operation
      scheduleFlush();
    },

    onPutAttr(kind: string, entityId: string, idx: number, value: unknown, entireArray?: unknown[]) {
      if (closed) return;
      // Strict mode: require entireArray to prevent data loss and index drift
      if (!entireArray) {
        throw new Error('[LMDB] onPutAttr requires entireArray parameter to avoid index drift and data loss');
      }
      bufferArrayRewrite(kind, entityId, entireArray);
    },

    onPutAttrArray(kind: string, entityId: string, values: unknown[]) {
      if (closed) return;
      bufferArrayRewrite(kind, entityId, values);
    },

    onDropAttr(kind: string, entityId: string, idx: number, entireArray?: unknown[]) {
      if (closed) return;
      // Always rewrite the entire array after drop
      if (entireArray !== undefined) {
        bufferArrayRewrite(kind, entityId, entireArray);
      } else {
        // Fallback: delete everything for this (kind, entityId)
        bufferArrayRewrite(kind, entityId, []);
      }
    },

    onAddRelation(relId: string, kind: string, src: string, tgt: string, info: unknown) {
      if (closed) return;
      ensureBuf.add(src);
      ensureBuf.add(tgt);
      relDeletes.delete(relId); // Cancel any pending delete
      relUpserts.set(relId, { kind, src, tgt, info: info ?? null, createdAt: Date.now() });
      scheduleFlush();
    },

    onUpdateRelation(relId: string, patch: { src?: string; tgt?: string; info?: unknown }) {
      if (closed) return;
      const r = relations.get(relId) || relUpserts.get(relId);
      if (!r) {
        console.warn('[LMDB] onUpdateRelation called on missing relId:', relId);
        return;
      }
      
      const updated = { ...r };
      if (patch.src) {
        ensureBuf.add(patch.src);
        updated.src = patch.src;
      }
      if (patch.tgt) {
        ensureBuf.add(patch.tgt);
        updated.tgt = patch.tgt;
      }
      if ('info' in patch) {
        updated.info = patch.info ?? null;
      }
      
      relUpserts.set(relId, updated);
      scheduleFlush();
    },

    onRemoveRelation(relId: string) {
      if (closed) return;
      relUpserts.delete(relId); // Cancel any pending upsert
      relDeletes.add(relId);
      scheduleFlush();
    },

    close,
    
    getErrorStats() {
      return { errorCount, lastError };
    }
  };
}