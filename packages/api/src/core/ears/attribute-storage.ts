/*─────────────────────────────────────────────────────────────
 * attribute‑store.ts – LMDB-backed attribute storage
 *
 * All reads go directly to LMDB on disk. Writes flush to LMDB
 * synchronously so reads always see fresh data.
 *─────────────────────────────────────────────────────────────*/
import { isPlainObject } from "@/core/helpers";
import { logInternal }   from "@/core/helpers/debug/cli/log-internal";
import { EARS } from "../types";
import { randomId } from "../helpers/random-id";
import { getLmdbPath, getVolatileLmdbPath, getSecretsLmdbPath } from "@/core/helpers/paths";
import { openShardedEnvs, closeShardedEnvs, deleteLmdbDirectories } from "@/core/persistence/lmdb/envs";
import { makeLmdbAdapter } from "@/core/persistence/lmdb/adapter";
import { makePolicy } from "@/core/persistence/partitioning/policy";
import { makeShardedPersistence } from "@/core/persistence/partitioning/sharded-router";
import { initLmdbReads } from './lmdb-reads';
import {
  lmdbGetAttr, lmdbGetAttrs, lmdbGetAllEntities, lmdbGetEntitiesOfType, lmdbGetAll,
  lmdbRelationIdsFor, lmdbRelationIdsForAll, lmdbHasRelation,
  lmdbGetAllRelationKinds, lmdbGetAllEntityTypes, lmdbGetAllAttributeKinds,
} from './lmdb-reads';

// Configuration
const HARD_DELETE_MODE = true;

// 1) Open environments
let envs = openShardedEnvs({
  primary: getLmdbPath(),
  volatileBackup: getVolatileLmdbPath(),
  secrets: getSecretsLmdbPath(),
});
initLmdbReads(envs.primary);

// 2) Create base sinks (syncFlush: true — reads come from LMDB)
const adapterOpts = { hardDelete: HARD_DELETE_MODE, syncFlush: true };
let sinks = {
  primary: makeLmdbAdapter(envs.primary, adapterOpts),
  volatileBackup: makeLmdbAdapter(envs.volatileBackup, adapterOpts),
  secrets: makeLmdbAdapter(envs.secrets, adapterOpts),
};

// 3) Policy: exclude TNode, handle secrets
const policy = makePolicy({
  excludedEntityTypes: new Set([EARS.Entity.TNode]),
  secretEntityTypes: new Set([EARS.Entity.Secret]),
  hydratePartitions: new Set(['primary', 'secrets']),
});

// 4) Sharded router
let persistence = makeShardedPersistence(policy, sinks);

// Export for testing and other modules
export { envs, policy, persistence };

// Graceful shutdown
export function closePersistence() {
  try {
    persistence.close?.();
    closeShardedEnvs(envs);
  } catch (error) {
    if (error instanceof Error &&
        !error.message?.includes('Dbi is not open') &&
        !error.message?.includes('already been closed')) {
      console.warn('[Persistence] Non-critical close error:', error.message);
    }
  }
}

// Reinitialize LMDB (close if needed, then reopen)
export function reinitializeLmdb() {
  if (envs !== null) closePersistence();

  envs = openShardedEnvs({
    primary: getLmdbPath(),
    volatileBackup: getVolatileLmdbPath(),
    secrets: getSecretsLmdbPath(),
  });

  sinks = {
    primary: makeLmdbAdapter(envs.primary, adapterOpts),
    volatileBackup: makeLmdbAdapter(envs.volatileBackup, adapterOpts),
    secrets: makeLmdbAdapter(envs.secrets, adapterOpts),
  };

  persistence = makeShardedPersistence(policy, sinks);
  initLmdbReads(envs.primary);
}

/** Reset LMDB by deleting and recreating all database directories. */
export async function resetLmdbFiles() {
  const currentEnvs = envs;
  envs = null as any;

  try {
    persistence.close?.();
    closeShardedEnvs(currentEnvs);
  } catch (error) {
    // Expected if already closed
  }

  await new Promise(resolve => setTimeout(resolve, 100));

  deleteLmdbDirectories({
    primary: getLmdbPath(),
    volatileBackup: getVolatileLmdbPath(),
    secrets: getSecretsLmdbPath(),
  });

  reinitializeLmdb();
}

/** No-op — kept for test compatibility. In-memory state no longer exists. */
export function clearMemory() {}

export const createEntity = (t: EARS.Entity) =>
  `${t}-${randomId()}` as EARS.EntityId;

/*─────────────────────────────────────────────────────────────
 * 1 ▸ write functions — flush to LMDB synchronously
 *─────────────────────────────────────────────────────────────*/
function makeMutator() {
  const add = (id: EARS.EntityId, kind: EARS.AttrKind, val: unknown) => {
    const list = [...(lmdbGetAttrs(id, kind) as EARS.AttributeValue[]), val as EARS.AttributeValue];
    persistence.onPutAttrArray?.(kind, id, list);
    logInternal("AA", false, kind, id, val);
  };

  const put = (id: EARS.EntityId, kind: EARS.AttrKind, val: unknown) => {
    persistence.onPutAttrArray?.(kind, id, [val]);
    logInternal("AU", false, kind, id, val);
  };

  const merge = (id: EARS.EntityId, kind: EARS.AttrKind, val: unknown, idx = 0) => {
    const list = [...(lmdbGetAttrs(id, kind) as EARS.AttributeValue[])];

    while (list.length < idx) list.push(null as any);

    if (list.length === idx) {
      list.push(val as EARS.AttributeValue);
    } else {
      const cur = list[idx];
      list[idx] =
        cur && isPlainObject(cur) && isPlainObject(val)
          ? { ...cur, ...val }
          : (val as EARS.AttributeValue);
    }

    persistence.onPutAttrArray?.(kind, id, list);
    logInternal("AU", false, kind, id, val);
  };

  const drop = (id: EARS.EntityId, kind: EARS.AttrKind, idx = 0) => {
    const list = [...(lmdbGetAttrs(id, kind) as EARS.AttributeValue[])];
    if (!list.length) return;
    list.splice(idx, 1);
    if (!list.length) {
      persistence.onDropAttr(kind, id, idx, []);
    } else {
      persistence.onPutAttrArray?.(kind, id, list);
    }
    logInternal("AR", false, kind, id, null);
  };

  const dropIf = (id: EARS.EntityId, kind: EARS.AttrKind, crit: unknown) => {
    const list = lmdbGetAttrs(id, kind) as EARS.AttributeValue[];
    if (!list.length) return;
    const i = list.findIndex(
      v =>
        v === crit ||
        (isPlainObject(v) &&
          isPlainObject(crit) &&
          Object.entries(crit).every(([k, v0]) => (v as any)[k] === v0)),
    );
    if (i !== -1) drop(id, kind, i);
  };

  const update = put;

  return { add, put, merge, drop, dropIf, update };
}

export const { put: putAttr, add: addAttr, merge: mergeAttr, drop: dropAttr, dropIf, update: updateAttr } =
  makeMutator();

/*─────────────────────────────────────────────────────────────
 * 2 ▸ roles & relations
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
  const existingRelId = lmdbHasRelation(src, kind, tgt);
  if (existingRelId) {
    const existingRel = getAttr(existingRelId, EARS.AttrKind.RelationDetails) as EARS.RelationDetail;
    if (info === undefined || JSON.stringify(existingRel.info) === JSON.stringify(info)) {
      console.warn(`[Relation] Duplicate relation link attempted (${kind}) between ${src} and ${tgt}. Reusing existing relation.`);
      return existingRelId;
    }
  }

  const relId = createEntity(EARS.Entity.Relation);
  putAttr(relId, EARS.AttrKind.RelationDetails, {
    sourceEntity: src,
    targetEntity: tgt,
    relationType: kind,
    info,
  } as EARS.RelationDetail);
  persistence.onAddRelation(relId, kind, src, tgt, info);
  return relId;
}

export function updateRelation(
  relId: EARS.EntityId,
  newS?: EARS.EntityId,
  newT?: EARS.EntityId,
  info?: unknown,
) {
  const d = getAttr(relId, EARS.AttrKind.RelationDetails) as EARS.RelationDetail | null;
  if (!d) return;
  if (newS) d.sourceEntity = newS;
  if (newT) d.targetEntity = newT;
  if (info !== undefined) d.info = info;
  mergeAttr(relId, EARS.AttrKind.RelationDetails, d);

  const patch: any = {};
  if (newS) patch.src = newS;
  if (newT) patch.tgt = newT;
  if (info !== undefined) patch.info = info;
  persistence.onUpdateRelation(relId, patch);
}

export const removeRelation = (relId: EARS.EntityId) => {
  dropAttr(relId, EARS.AttrKind.RelationDetails);
  persistence.onRemoveRelation(relId);
};

/*─────────────────────────────────────────────────────────────
 * 3 ▸ read functions — all from LMDB
 *─────────────────────────────────────────────────────────────*/
export const getAttr = (id: EARS.EntityId, k: EARS.AttrKind, i = 0) =>
  lmdbGetAttr(id, k, i);

export const getAttrs = (id: EARS.EntityId, k: EARS.AttrKind) =>
  lmdbGetAttrs(id, k);

export const getRoles = (id: EARS.EntityId) =>
  getAttrs(id, EARS.AttrKind.Role) as string[];

export const getAll = (id: EARS.EntityId) =>
  lmdbGetAll(id);

export const getAllEntities = (): EARS.EntityId[] =>
  lmdbGetAllEntities();

export const getEntitiesOfType = (t: EARS.Entity) =>
  lmdbGetEntitiesOfType(t);

export const queryEntitiesByRole = (role: string) =>
  getAllEntities().filter(id => getRoles(id).includes(role));

export const queryEntitiesByAttribute = (k: EARS.AttrKind, v?: unknown) =>
  v === undefined
    ? getAllEntities().filter(id => getAttrs(id, k).length)
    : getAllEntities().filter(id => getAttrs(id, k).some(attr => attr === v));

/** target id participates in *any* relation with `target` (both directions) */
export const queryEntitiesInRelationTo = (target: EARS.EntityId) => {
  const relIds = lmdbRelationIdsForAll(target);
  const out = new Set<EARS.EntityId>();
  for (const relId of relIds) {
    const d = getAttr(relId, EARS.AttrKind.RelationDetails) as EARS.RelationDetail;
    if (d?.sourceEntity === target) out.add(d.targetEntity);
    else if (d?.targetEntity === target) out.add(d.sourceEntity);
  }
  return [...out];
};

/** one specific relation type (+ direction) */
export const queryEntitiesByRelationTo = (relKind: string, id: EARS.EntityId, asSource = false) => {
  const relIds = lmdbRelationIdsFor(id, relKind, asSource ? 'out' : 'in');
  return relIds
    .map(rel => {
      const d = getAttr(rel, EARS.AttrKind.RelationDetails) as EARS.RelationDetail;
      return asSource ? d?.targetEntity : d?.sourceEntity;
    })
    .filter(Boolean);
};

/*─────────────────────────────────────────────────────────────
 * 4 ▸ entity teardown (needed by tx.destroy)
 *─────────────────────────────────────────────────────────────*/
export function destroyEntity(id: EARS.EntityId, skipPersistence = false) {
  const allRelIds = lmdbRelationIdsForAll(id);
  allRelIds.forEach(removeRelation);

  if (!skipPersistence) {
    persistence.onDestroyEntity(id);
  }
}

/*─────────────────────────────────────────────────────────────
 * 5 ▸ Schema discovery helpers
 *─────────────────────────────────────────────────────────────*/
export const getAllAttributeKinds = (): EARS.AttrKind[] =>
  lmdbGetAllAttributeKinds();

export const getAllRelationKinds = (): string[] =>
  lmdbGetAllRelationKinds();

export const getAllEntityTypes = (): EARS.Entity[] =>
  lmdbGetAllEntityTypes();

export const getAttributeStats = (kind: EARS.AttrKind) => {
  const entities = [...new Set(
    [...(function*() {
      const US = '\x1F';
      const prefix = `${kind}${US}`;
      for (const { key } of envs.primary.attrs.getRange({ start: prefix, end: prefix + '\xFF' })) {
        const k = String(key);
        const i = k.indexOf(US);
        const j = k.indexOf(US, i + 1);
        yield k.substring(i + 1, j);
      }
    })()]
  )];
  let totalValues = 0;
  for (const eid of entities) {
    totalValues += lmdbGetAttrs(eid as EARS.EntityId, kind).length;
  }
  return { entityCount: entities.length, totalValues };
};
