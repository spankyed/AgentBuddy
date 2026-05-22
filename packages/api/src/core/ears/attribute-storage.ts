/*─────────────────────────────────────────────────────────────
 * attribute‑store.ts – single‑bucket, generic mutator + query shims
 *─────────────────────────────────────────────────────────────*/
import { isPlainObject } from "@/core/shared";
import { logInternal }   from "@/core/shared/debug/cli/log-internal";
import { relationIndex, addToIndex, removeFromIndex, updateIndex, clearRelationIndex } from "./relation-index";
import { EARS } from "../types";
import { randomId } from "../shared/random-id";
import { getLmdbPath, getVolatileLmdbPath, getSecretsLmdbPath } from "@/core/shared/paths";
import { openShardedEnvs, closeShardedEnvs, deleteLmdbDirectories } from "@/core/persistence/lmdb/envs";
import { makeLmdbAdapter } from "@/core/persistence/lmdb/adapter";
import { makePolicy } from "@/core/persistence/partitioning/policy";
import { makeShardedPersistence } from "@/core/persistence/partitioning/sharded-router";

// Configuration for hard delete mode
const HARD_DELETE_MODE = true; // Set to true to permanently delete entities instead of tombstoning

// 1) Open two environments
let envs = openShardedEnvs({
  primary: getLmdbPath(),
  volatileBackup: getVolatileLmdbPath(),
  secrets: getSecretsLmdbPath(),
});

// 2) Create base sinks
let sinks = {
  primary: makeLmdbAdapter(envs.primary, { hardDelete: HARD_DELETE_MODE }),
  volatileBackup: makeLmdbAdapter(envs.volatileBackup, { hardDelete: HARD_DELETE_MODE }),
  secrets: makeLmdbAdapter(envs.secrets, { hardDelete: HARD_DELETE_MODE }),
};

// 3) Policy: exclude TNode, handle secrets
const policy = makePolicy({
  excludedEntityTypes: new Set([EARS.Entity.TNode]),
  secretEntityTypes: new Set([EARS.Entity.Secret]),
  hydratePartitions: new Set(['primary', 'secrets']), // hydrate primary and secrets on startup
});

// 4) Sharded router
let persistence = makeShardedPersistence(policy, sinks);

// Export for hydration and testing
export { envs, policy, persistence };

// Graceful shutdown function
export function closePersistence() {
  try {
    persistence.close?.();
    closeShardedEnvs(envs);
  } catch (error) {
    // Log unexpected errors but don't throw
    if (error instanceof Error &&
        !error.message?.includes('Dbi is not open') &&
        !error.message?.includes('already been closed')) {
      console.warn('[Persistence] Non-critical close error:', error.message);
    }
  }
}

// Reinitialize LMDB (close if needed, then reopen)
export function reinitializeLmdb() {
  if (envs !== null) {
    closePersistence();
  }

  envs = openShardedEnvs({
    primary: getLmdbPath(),
    volatileBackup: getVolatileLmdbPath(),
    secrets: getSecretsLmdbPath(),
  });

  sinks = {
    primary: makeLmdbAdapter(envs.primary, { hardDelete: HARD_DELETE_MODE }),
    volatileBackup: makeLmdbAdapter(envs.volatileBackup, { hardDelete: HARD_DELETE_MODE }),
    secrets: makeLmdbAdapter(envs.secrets, { hardDelete: HARD_DELETE_MODE }),
  };

  persistence = makeShardedPersistence(policy, sinks);
}

/**
 * Reset LMDB by deleting and recreating all database directories.
 * Follows pattern: null → close → delete → recreate
 */
export async function resetLmdbFiles() {
  // Clear memory and null out envs to prevent new operations
  clearMemory();
  const currentEnvs = envs;
  envs = null as any;

  // Close connections
  try {
    persistence.close?.();
    closeShardedEnvs(currentEnvs);
  } catch (error) {
    // Expected if already closed
  }

  // Wait for OS to release file handles
  await new Promise(resolve => setTimeout(resolve, 100));

  // Delete directories
  deleteLmdbDirectories({
    primary: getLmdbPath(),
    volatileBackup: getVolatileLmdbPath(),
    secrets: getSecretsLmdbPath(),
  });

  // Recreate fresh databases
  reinitializeLmdb();
}

export const createEntity = (t: EARS.Entity) =>
  `${t}-${randomId()}` as EARS.EntityId;

/*─ base buckets ─*/
const store       = new Map<EARS.AttrKind, Map<EARS.EntityId, EARS.AttributeValue[]>>();
const entityIndex = new Map<EARS.Entity, Set<EARS.EntityId>>();

/*─ memory management ─*/
export function clearMemory() {
  store.clear();
  entityIndex.clear();
  clearRelationIndex();
}

/*─ helpers ─*/
const bucket = (k: EARS.AttrKind) => {
  if (!store.has(k)) store.set(k, new Map());
  return store.get(k)!;
};
const entType = (id: EARS.EntityId) => {
  const dash = id.indexOf('-');
  return dash === -1 ? id as EARS.Entity : id.substring(0, dash) as EARS.Entity;
};

/*─────────────────────────────────────────────────────────────
 * 1 ▸ generic mutator factory
 *─────────────────────────────────────────────────────────────*/
function makeMutator() {
  // add - appends a new value to the array (old putAttr behavior)
  const add = (id: EARS.EntityId, kind: EARS.AttrKind, val: unknown) => {
    const b = bucket(kind);
    (b.get(id) ?? b.set(id, []).get(id)!).push(val as EARS.AttributeValue);
    (entityIndex.get(entType(id)) ?? (entityIndex.set(entType(id), new Set()), entityIndex.get(entType(id)))!)
      .add(id);
    const list = b.get(id)!;
    // Use array rewrite for consistency
    persistence.onPutAttrArray?.(kind, id, list);
    logInternal("AA", false, kind, id, val);
  };

  // put - replaces the entire array with a single value (old updateAttr behavior)
  const put = (id: EARS.EntityId, kind: EARS.AttrKind, val: unknown) => {
    const b = bucket(kind);
    // Replace the entire array with a single value
    b.set(id, [val as EARS.AttributeValue]);
    // Ensure entity is in index
    (entityIndex.get(entType(id)) ?? (entityIndex.set(entType(id), new Set()), entityIndex.get(entType(id)))!)
      .add(id);
    // Use array rewrite for consistency
    persistence.onPutAttrArray?.(kind, id, [val]);
    logInternal("AU", false, kind, id, val);
  };

  const merge = (id: EARS.EntityId, kind: EARS.AttrKind, val: unknown, idx = 0) => {
    const b = bucket(kind);
    let list = b.get(id);
    if (!list) {
      list = [];
      b.set(id, list);
      // Also ensure entity is in index
      (entityIndex.get(entType(id)) ?? (entityIndex.set(entType(id), new Set()), entityIndex.get(entType(id)))!)
        .add(id);
    }
    
    // Fill gaps with null instead of the value
    while (list.length < idx) list.push(null as any);
    
    // Ensure we have an element at idx
    if (list.length === idx) {
      list.push(val as EARS.AttributeValue);
    } else {
      const cur = list[idx];
      list[idx] =
        cur && isPlainObject(cur) && isPlainObject(val)
          ? { ...cur, ...val }
          : (val as EARS.AttributeValue);
    }
    
    // Use array rewrite for consistency
    persistence.onPutAttrArray?.(kind, id, list);
    logInternal("AU", false, kind, id, val);
  };

  const drop = (id: EARS.EntityId, kind: EARS.AttrKind, idx = 0) => {
    const list = bucket(kind).get(id);
    if (!list?.length) return;
    list.splice(idx, 1);
    if (!list.length) {
      bucket(kind).delete(id);
      // Empty array - remove from persistence
      persistence.onDropAttr(kind, id, idx, []);
    } else {
      // Use array rewrite for consistency
      persistence.onPutAttrArray?.(kind, id, list);
    }
    logInternal("AR", false, kind, id, null);
  };

  const dropIf = (id: EARS.EntityId, kind: EARS.AttrKind, crit: unknown) => {
    const list = bucket(kind).get(id);
    if (!list) return;
    const i = list.findIndex(
      v =>
        v === crit ||
        (isPlainObject(v) &&
          isPlainObject(crit) &&
          Object.entries(crit).every(([k, v0]) => (v as any)[k] === v0)),
    );
    if (i !== -1) drop(id, kind, i);
  };

  // update - alias for put (for backward compatibility)
  const update = put;

  return { add, put, merge, drop, dropIf, update };
}
// Export with new naming convention:
// putAttr - replaces value (default behavior)
// addAttr - appends value (for multiple attributes)
// updateAttr - alias for putAttr (backward compatibility)
export const { put: putAttr, add: addAttr, merge: mergeAttr, drop: dropAttr, dropIf, update: updateAttr } =
  makeMutator();

/*─────────────────────────────────────────────────────────────
 * 2 ▸ roles & relations thin wrappers
 *─────────────────────────────────────────────────────────────*/
export const grantRole  = (id: EARS.EntityId, role: string) =>
  addAttr(id, EARS.AttrKind.Role, role);
export const revokeRole = (id: EARS.EntityId, role: string) =>
  dropIf(id, EARS.AttrKind.Role, role);

export function addRelation(
  src: EARS.EntityId,
  kind: string,
  tgt: EARS.EntityId,
  info?: unknown,
) {
  // Check for existing relation with same source, kind, and target to prevent duplicates
  const entry = relationIndex[kind];
  if (entry?.bySource?.[src] && entry?.byTarget?.[tgt]) {
    const fromSource = new Set(entry.bySource[src]);
    const fromTarget = new Set(entry.byTarget[tgt]);

    // Find intersection - relations that match both source and target
    for (const existingRelId of fromSource) {
      if (fromTarget.has(existingRelId)) {
        // Found existing relation - check if info matches
        const existingRel = getAttr(existingRelId, EARS.AttrKind.RelationDetails) as EARS.RelationDetail;

        // If no info provided, or info matches existing, return existing relation (idempotent)
        if (info === undefined || JSON.stringify(existingRel.info) === JSON.stringify(info)) {
          console.warn(`[Relation] Duplicate relation link attempted (${kind}) between ${src} and ${tgt}. Reusing existing relation.`);
          return existingRelId;
        }
        // If info differs, continue to create new relation (allows multi-value with distinct info)
      }
    }
  }

  // No existing relation found (or info differs) - create new one
  const relId = createEntity(EARS.Entity.Relation);
  putAttr(relId, EARS.AttrKind.RelationDetails, {
    sourceEntity: src,
    targetEntity: tgt,
    relationType: kind,
    info,
  } as EARS.RelationDetail);
  addToIndex(kind, src, tgt, relId);
  persistence.onAddRelation(relId, kind, src, tgt, info);
  return relId;
}

export function updateRelation(
  relId: EARS.EntityId,
  newS?: EARS.EntityId,
  newT?: EARS.EntityId,
  info?: unknown,
) {
  const d = getAttr(
    relId,
    EARS.AttrKind.RelationDetails,
  ) as EARS.RelationDetail | null;
  if (!d) return;
  const { sourceEntity: oS, targetEntity: oT, relationType: k } = d;
  if (newS) d.sourceEntity = newS;
  if (newT) d.targetEntity = newT;
  if (info !== undefined) d.info = info;
  mergeAttr(relId, EARS.AttrKind.RelationDetails, d);
  if (newS || newT)
    updateIndex(k, relId, oS, oT, d.sourceEntity, d.targetEntity);
  
  // Only include defined values in the patch
  const patch: any = {};
  if (newS) patch.src = newS;
  if (newT) patch.tgt = newT;
  if (info !== undefined) patch.info = info;
  persistence.onUpdateRelation(relId, patch);
}

export const removeRelation = (relId: EARS.EntityId) => {
  const d = getAttr(
    relId,
    EARS.AttrKind.RelationDetails,
  ) as EARS.RelationDetail | null;
  if (d)
    removeFromIndex(d.relationType, d.sourceEntity, d.targetEntity, relId);
  dropAttr(relId, EARS.AttrKind.RelationDetails);
  persistence.onRemoveRelation(relId);
};

/*─────────────────────────────────────────────────────────────
 * 3 ▸ simple getters (kept identical)
 *─────────────────────────────────────────────────────────────*/
export const getAttr  = (id: EARS.EntityId, k: EARS.AttrKind, i = 0) =>
  bucket(k).get(id)?.[i] ?? null;
export const getAttrs = (id: EARS.EntityId, k: EARS.AttrKind) =>
  bucket(k).get(id) ?? [];
export const getRoles = (id: EARS.EntityId) =>
  getAttrs(id, EARS.AttrKind.Role) as string[];

export const getAll = (id: EARS.EntityId) => {
  const out: Record<string, unknown> = {};
  for (const [k, b] of store)
    if (b.get(id))
      out[k] = b.get(id)!.length === 1 ? b.get(id)![0] : b.get(id);
  return out;
};

/*─────────────────────────────────────────────────────────────
 * 4 ▸  convenience *query* shims  (❗added back)
 *─────────────────────────────────────────────────────────────*/
export const getAllEntities = () => {
  const all: EARS.EntityId[] = [];
  for (const set of entityIndex.values()) {
    for (const id of set) {
      all.push(id);
    }
  }
  return all;
};

export const getEntitiesOfType = (t: EARS.Entity) =>
  [...(entityIndex.get(t) ?? [])];

export const queryEntitiesByRole = (role: string) =>
  getAllEntities().filter(id => getRoles(id).includes(role));

export const queryEntitiesByAttribute = (
  k: EARS.AttrKind,
  v?: unknown,
) =>
  v === undefined
    ? getAllEntities().filter(id => getAttrs(id, k).length)
    : getAllEntities().filter(id =>
        getAttrs(id, k).some(attr => attr === v),
      );

/** target id participates in *any* relation with `target` (both directions) */
export const queryEntitiesInRelationTo = (target: EARS.EntityId) => {
  const out = new Set<EARS.EntityId>();
  for (const k of Object.keys(relationIndex)) {
    const { bySource, byTarget } = relationIndex[k];
    bySource[target]?.forEach(relId => {
      const { targetEntity } = getAttr(
        relId,
        EARS.AttrKind.RelationDetails,
      ) as EARS.RelationDetail;
      out.add(targetEntity);
    });
    byTarget[target]?.forEach(relId => {
      const { sourceEntity } = getAttr(
        relId,
        EARS.AttrKind.RelationDetails,
      ) as EARS.RelationDetail;
      out.add(sourceEntity);
    });
  }
  return [...out];
};

/** one specific relation type (+ direction) */
export const queryEntitiesByRelationTo = (
  relKind: string,
  id: EARS.EntityId,
  asSource = false,
) => {
  const dir = relationIndex[relKind];
  if (!dir) return [];
  const relIds = asSource ? dir.bySource[id] ?? [] : dir.byTarget[id] ?? [];
  return relIds
    .map(rel => {
      const d = getAttr(
        rel,
        EARS.AttrKind.RelationDetails,
      ) as EARS.RelationDetail;
      return asSource ? d.targetEntity : d.sourceEntity;
    })
    .filter(Boolean);
};

/*─────────────────────────────────────────────────────────────
 * 5 ▸ entity teardown (needed by tx.destroy)
 *─────────────────────────────────────────────────────────────*/
export function destroyEntity(id: EARS.EntityId, skipPersistence = false) {
  /* remove from relation index */
  for (const k of Object.keys(relationIndex)) {
    const { bySource, byTarget } = relationIndex[k];
    const relIds = [...(bySource[id] ?? []), ...(byTarget[id] ?? [])];
    relIds.forEach(removeRelation);
    delete bySource[id];
    delete byTarget[id];
  }

  /* remove all attributes */
  for (const [k, b] of store) b.delete(id);

  /* entity index */
  const entitySet = entityIndex.get(entType(id));
  if (entitySet) {
    entitySet.delete(id);
    // Clean up empty sets to prevent memory leaks
    if (entitySet.size === 0) {
      entityIndex.delete(entType(id));
    }
  }
  
  /* persist the deletion unless skipped (for volatile data) */
  if (!skipPersistence) {
    persistence.onDestroyEntity(id);
  }
}

/*─────────────────────────────────────────────────────────────
 * 6 ▸ exports list
 *─────────────────────────────────────────────────────────────*/

/*─────────────────────────────────────────────────────────────
 * 7 ▸ Schema discovery helpers
 *─────────────────────────────────────────────────────────────*/

export const getAllAttributeKinds = (): EARS.AttrKind[] => Array.from(store.keys());

export const getAllRelationKinds = (): string[] => Object.keys(relationIndex);

export const getAllEntityTypes = (): EARS.Entity[] => Array.from(entityIndex.keys());

export const getAttributeStats = (kind: EARS.AttrKind) => {
  const b = bucket(kind);
  let totalValues = 0;
  for (const values of b.values()) {
    totalValues += values.length;
  }
  return { entityCount: b.size, totalValues };
};