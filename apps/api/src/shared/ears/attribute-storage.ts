/*─────────────────────────────────────────────────────────────
 * attribute‑store.ts – single‑bucket, generic mutator + query shims
 *─────────────────────────────────────────────────────────────*/
import { isPlainObject } from "@/shared/utils";
import { logInternal }   from "@/shared/debug/log";
import { relationIndex, addToIndex, removeFromIndex, updateIndex } from "./relation-index";
import { EARS } from "./types";
import { randomId } from "../utils/random-id";
import { createEntity } from "./create-entity";

/*─ base buckets ─*/
const store       = new Map<EARS.AttrKind, Map<EARS.EntityId, EARS.AttributeValue[]>>();
const entityIndex = new Map<EARS.Entity, Set<EARS.EntityId>>();

/*─ helpers ─*/
const bucket = (k: EARS.AttrKind) => {
  if (!store.has(k)) store.set(k, new Map());
  return store.get(k)!;
};
const entType = (id: EARS.EntityId) => id.split("-",1)[0] as EARS.Entity;

/*─────────────────────────────────────────────────────────────
 * 1 ▸ generic mutator factory
 *─────────────────────────────────────────────────────────────*/
function makeMutator() {
  const add = (id: EARS.EntityId, kind: EARS.AttrKind, val: unknown) => {
    const b = bucket(kind);
    (b.get(id) ?? b.set(id, []).get(id)!).push(val as EARS.AttributeValue);
    (entityIndex.get(entType(id)) ?? (entityIndex.set(entType(id), new Set()), entityIndex.get(entType(id)))!)
      .add(id);
    logInternal("AA", false, kind, id, val);
  };

  const merge = (id: EARS.EntityId, kind: EARS.AttrKind, val: unknown, idx = 0) => {
    const list = bucket(kind).get(id) ?? [];
    while (list.length <= idx) list.push(val as EARS.AttributeValue);
    const cur = list[idx];
    list[idx] =
      cur && isPlainObject(cur) && isPlainObject(val)
        ? { ...cur, ...val }
        : (val as EARS.AttributeValue);
    logInternal("AU", false, kind, id, val);
  };

  const drop = (id: EARS.EntityId, kind: EARS.AttrKind, idx = 0) => {
    const list = bucket(kind).get(id);
    if (!list?.length) return;
    list.splice(idx, 1);
    if (!list.length) bucket(kind).delete(id);
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

  return { add, merge, drop, dropIf };
}
export const { add: putAttr, merge: mergeAttr, drop: dropAttr, dropIf } =
  makeMutator();

/*─────────────────────────────────────────────────────────────
 * 2 ▸ roles & relations thin wrappers
 *─────────────────────────────────────────────────────────────*/
export const grantRole  = (id: EARS.EntityId, role: string) =>
  putAttr(id, EARS.AttrKind.Role, role);
export const revokeRole = (id: EARS.EntityId, role: string) =>
  dropIf(id, EARS.AttrKind.Role, role);

export function addRelation(
  src: EARS.EntityId,
  kind: string,
  tgt: EARS.EntityId,
  info?: unknown,
) {
  const relId = createEntity(EARS.Entity.Relation);
  putAttr(relId, EARS.AttrKind.RelationDetails, {
    sourceEntity: src,
    targetEntity: tgt,
    relationType: kind,
    info,
  } as EARS.RelationDetail);
  addToIndex(kind, src, tgt, relId);
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
}

export const removeRelation = (relId: EARS.EntityId) => {
  const d = getAttr(
    relId,
    EARS.AttrKind.RelationDetails,
  ) as EARS.RelationDetail | null;
  if (d)
    removeFromIndex(d.relationType, d.sourceEntity, d.targetEntity, relId);
  dropAttr(relId, EARS.AttrKind.RelationDetails);
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
export const getAllEntities = () =>
  [...entityIndex.values()].flatMap(set => [...set]);

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

/** id participates in *any* relation with `target` (both directions) */
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
export function destroyEntity(id: EARS.EntityId) {
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
  entityIndex.get(entType(id))?.delete(id);
}

/*─────────────────────────────────────────────────────────────
 * 6 ▸ exports list
 *─────────────────────────────────────────────────────────────*/
