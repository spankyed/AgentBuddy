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

function attrKey(kind: string, entityId: string, idx: number) {
  validateKey(kind, 'kind');
  validateKey(entityId, 'entityId');
  return `${kind}\x1F${entityId}\x1F${idx}`;
}

function validateKey(value: string, name: string) {
  if (value.includes('\x1F')) {
    throw new Error(`Invalid ${name}: contains forbidden separator character \\x1F`);
  }
}

function prefix(kind: string, entityId: string) {
  const p = `${kind}\x1F${entityId}\x1F`;
  // End bound: any key with this prefix sorts before prefix+\xFF
  return { start: p, end: p + '\xFF' };
}

const entTypeOf = (id: string) => id.split('-')[0] ?? id;

// Error tracking
let errorCount = 0;
let lastError: { op: string; key?: string; error: any } | null = null;

export function makeLmdbAdapter(dbs: Dbs): PersistenceSink {
  const { entities, attrs, relations } = dbs;

  // Keyed buffers for coalescing writes
  const arrayRewrites = new Map<string, unknown[]>(); // kind|entityId -> final array
  const ensureBuf = new Set<string>();
  const relUpserts = new Map<string, any>();
  const relDeletes = new Set<string>();
  const entityUpdates = new Map<string, any>();
  
  let scheduled = false;
  let closed = false;

  function scheduleFlush() {
    if (scheduled || closed) return;
    scheduled = true;
    queueMicrotask(() => {
      if (closed) return;
      scheduled = false;
      
      try {
        entities.transactionSync(() => {
          // Ensure entities (idempotent puts, no doesExist check)
          for (const id of ensureBuf) {
            entities.put(id, { type: entTypeOf(id), createdAt: Date.now() });
          }
          ensureBuf.clear();

          // Entity updates (for destroy operations)
          for (const [id, data] of entityUpdates) {
            entities.put(id, data);
          }
          entityUpdates.clear();

          // Array rewrites - atomic replacement of entire arrays
          for (const [key, arr] of arrayRewrites) {
            const [kind, entityId] = key.split('|');
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
    const key = `${kind}|${entityId}`;
    // Store only the final state of the array
    arrayRewrites.set(key, [...array]); // Clone to avoid mutations
    ensureBuf.add(entityId);
    scheduleFlush();
  }

  function close() {
    if (closed) return;
    
    // Final flush
    if (scheduled) {
      // Force synchronous flush
      scheduled = false;
      
      try {
        entities.transactionSync(() => {
          for (const id of ensureBuf) {
            entities.put(id, { type: entTypeOf(id), createdAt: Date.now() });
          }
          for (const [id, data] of entityUpdates) {
            entities.put(id, data);
          }
          for (const [key, arr] of arrayRewrites) {
            const [kind, entityId] = key.split('|');
            const { start, end } = prefix(kind, entityId);
            for (const { key } of attrs.getRange({ start, end })) {
              attrs.remove(key);
            }
            for (let i = 0; i < arr.length; i++) {
              attrs.put(attrKey(kind, entityId, i), enc(arr[i]));
            }
          }
          for (const id of relDeletes) {
            relations.remove(id);
          }
          for (const [id, obj] of relUpserts) {
            relations.put(id, obj);
          }
        });
      } catch (error) {
        console.error('[LMDB] Final flush failed:', error);
      }
    }
    
    closed = true;
  }

  return {
    onCreateEntity(entityId: string, type?: string) {
      if (closed) return;
      ensureBuf.add(entityId);
      // Override with specific type if provided
      if (type) {
        entityUpdates.set(entityId, { type, createdAt: Date.now() });
      }
      scheduleFlush();
    },

    onDestroyEntity(entityId: string) {
      if (closed) return;
      // Get current entity data
      const rec = entities.get(entityId);
      if (rec) {
        entityUpdates.set(entityId, { ...rec, deletedAt: Date.now() });
      }
      
      // Option B: Keep attrs/relations on disk, filter during hydration
      // This is cleaner and avoids the expensive scan operation
      scheduleFlush();
    },

    onPutAttr(kind: string, entityId: string, idx: number, value: unknown, entireArray?: unknown[]) {
      if (closed) return;
      // Always use the entire array if provided
      if (entireArray) {
        bufferArrayRewrite(kind, entityId, entireArray);
      } else {
        // For backward compatibility, still support single value updates
        // but this should be avoided in favor of passing the entire array
        console.warn('[LMDB] onPutAttr called without entireArray - this may cause inconsistency');
        ensureBuf.add(entityId);
        scheduleFlush();
      }
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
      if (!r) return;
      
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