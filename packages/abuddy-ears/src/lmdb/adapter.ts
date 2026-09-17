import type { LmdbDbs } from './envs.ts';
import type { PersistenceSink } from '../runtime.ts';
import { EARS } from '../entities.ts';

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

/** The attribute kinds stored in `attrs`: keys sort by kind, so each lookup skips past the kind before it */
function* storedKinds(attrs: LmdbDbs['attrs']): Iterable<string> {
  let start = '';
  for (;;) {
    const [key] = attrs.getKeys({ start, limit: 1 }) as Iterable<string>;
    if (key === undefined) return;
    const kind = String(key).split(SEP)[0];
    yield kind;
    // Past every `kind␟…` key (ids sort below \xFF, as in prefix())
    start = `${kind}${SEP}\xFF`;
  }
}

export function makeLmdbAdapter(dbs: LmdbDbs): PersistenceSink {
  const { entities, attrs, relations } = dbs;

  // Error tracking
  let errorCount = 0;
  let lastError: { op: string; key?: string; error: any } | null = null;

  // Keyed buffers for coalescing writes
  const arrayRewrites = new Map<string, unknown[]>(); // kind\x1FentityId -> final array
  const ensureBuf = new Set<string>();
  const relUpserts = new Map<string, any>();
  const relDeletes = new Set<string>();
  const entityUpdates = new Map<string, any>();
  // Rows of relations whose details were dropped: a relation's id has an entity row while it exists
  const entityRemovals = new Set<string>();
  
  let scheduled = false;
  let closed = false;

  // Extract flush logic to reusable function
  function flushBody() {
    // Use single timestamp for consistency
    const ts = Date.now();
    
    // Ensure entities (check doesExist to preserve createdAt)
    for (const id of ensureBuf) {
      if (id && !entities.doesExist(id)) {
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

    for (const id of entityRemovals) {
      entities.remove(id);
    }
    entityRemovals.clear();

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
        entityRemovals.clear();
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
    if (array.length) {
      ensureBuf.add(entityId);
      entityRemovals.delete(entityId);
    } else if (kind === EARS.AttrKind.RelationDetails) {
      // The relation is gone, and with it its id's row
      ensureBuf.delete(entityId);
      entityUpdates.delete(entityId);
      entityRemovals.add(entityId);
    }
    scheduleFlush();
  }

  /** Drops the writes buffered for an entity, so a flush after its hard delete doesn't write it back */
  function discardBuffered(entityId: string) {
    ensureBuf.delete(entityId);
    entityUpdates.delete(entityId);
    for (const key of arrayRewrites.keys()) {
      if (key.slice(key.indexOf(SEP) + 1) === entityId) arrayRewrites.delete(key);
    }
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
      entityRemovals.clear();
      arrayRewrites.clear();
      relDeletes.clear();
      relUpserts.clear();
    }
  }

  return {
    onCreateEntity(entityId: string, type?: string) {
      if (closed) return;
      ensureBuf.add(entityId);
      // The row takes its type from the id's prefix; only a type that differs is written over it
      if (type && type !== entTypeOf(entityId)) {
        entityUpdates.set(entityId, { type });
      }
      scheduleFlush();
    },

    onDestroyEntity(entityId: string) {
      if (closed) return;

      discardBuffered(entityId);
      // Deleted now: the entity's row and its attributes, read per kind (keys are kind␟id␟index).
      // Its relations are removed before this, each with onRemoveRelation.
      try {
        entities.transactionSync(() => {
          entities.remove(entityId);
          for (const kind of [...storedKinds(attrs)]) {
            for (const key of [...attrs.getKeys(prefix(kind, entityId))]) attrs.remove(key);
          }
        });
      } catch (error) {
        console.error(`[LMDB] Failed to delete entity ${entityId}:`, error);
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
      
      // Validate src and tgt are valid entity IDs (not stringified undefined/null)
      if (!src || src === 'undefined' || src === 'null' || typeof src !== 'string') {
        console.warn(`[LMDB] Invalid src in onAddRelation: relId=${relId}, src="${src}"`);
        return;
      }
      if (!tgt || tgt === 'undefined' || tgt === 'null' || typeof tgt !== 'string') {
        console.warn(`[LMDB] Invalid tgt in onAddRelation: relId=${relId}, tgt="${tgt}"`);
        return;
      }
      // Basic entity ID format check (should contain hyphen)
      if (!src.includes('-')) {
        console.warn(`[LMDB] Invalid src format in onAddRelation: relId=${relId}, src="${src}" (missing hyphen)`);
        return;
      }
      if (!tgt.includes('-')) {
        console.warn(`[LMDB] Invalid tgt format in onAddRelation: relId=${relId}, tgt="${tgt}" (missing hyphen)`);
        return;
      }
      
      ensureBuf.add(src);
      ensureBuf.add(tgt);
      // A relation written again (routed here after a reopen) keeps when it was created
      const createdAt = relDeletes.has(relId) ? undefined : (relUpserts.get(relId) ?? relations.get(relId))?.createdAt;
      relDeletes.delete(relId); // Cancel any pending delete
      relUpserts.set(relId, { kind, src, tgt, info: info ?? null, createdAt: createdAt ?? Date.now() });
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
        // Validate src is a valid entity ID
        if (patch.src === 'undefined' || patch.src === 'null' || typeof patch.src !== 'string') {
          console.warn(`[LMDB] Invalid src in onUpdateRelation: relId=${relId}, src="${patch.src}"`);
          return;
        }
        if (!patch.src.includes('-')) {
          console.warn(`[LMDB] Invalid src format in onUpdateRelation: relId=${relId}, src="${patch.src}" (missing hyphen)`);
          return;
        }
        ensureBuf.add(patch.src);
        updated.src = patch.src;
      }
      if (patch.tgt) {
        // Validate tgt is a valid entity ID
        if (patch.tgt === 'undefined' || patch.tgt === 'null' || typeof patch.tgt !== 'string') {
          console.warn(`[LMDB] Invalid tgt in onUpdateRelation: relId=${relId}, tgt="${patch.tgt}"`);
          return;
        }
        if (!patch.tgt.includes('-')) {
          console.warn(`[LMDB] Invalid tgt format in onUpdateRelation: relId=${relId}, tgt="${patch.tgt}" (missing hyphen)`);
          return;
        }
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