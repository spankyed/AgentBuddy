/*───────────────────────────────────────────────────────────────────────────
 * attribute‑store.ts – Map/Set‑backed, strongly‑typed revision
 *───────────────────────────────────────────────────────────────────────────*/
import { isPlainObject } from "@/shared/utils";
import { logInternal } from "@/systems/_ears/debug/log";
import { createEntity } from "./create-entity";
import {
  updateIndex,
  relationIndex,
  addToIndex,
  removeFromIndex,
  type RelationKind,
} from "./relation-index";
import { ECS, AttrKind, type AttributeValue } from "./types";

/*-------------------------------------------------------------------------*\
| 1 ▸ Bucket helpers                                                        |
\*-------------------------------------------------------------------------*/
const store: Map<AttrKind, Map<ECS.EntityId, AttributeValue[]>> = new Map();
const getBucket = (kind: AttrKind): Map<ECS.EntityId, AttributeValue[]> => {
  let bucket = store.get(kind);
  if (!bucket) {
    bucket = new Map<ECS.EntityId, AttributeValue[]>();
    store.set(kind, bucket);
  }
  return bucket;
};

/*-------------------------------------------------------------------------*\
| 2 ▸ Mutators                                                              |
\*-------------------------------------------------------------------------*/
function addAttribute(entityID: ECS.EntityId, kind: AttrKind, value: AttributeValue) {
  const bucket = getBucket(kind);
  let list = bucket.get(entityID);
  if (!list) {
    list = [];
    bucket.set(entityID, list);
  }
  list.push(value);
  logInternal("AA", false, kind, entityID, value);
}

const addRole = (id: ECS.EntityId, role: string) => addAttribute(id, AttrKind.Role, role);

function addRelation(
  source: ECS.EntityId,
  relationType: RelationKind,
  target: ECS.EntityId,
  info?: AttributeValue,
): ECS.EntityId {
  const relId = createEntity(ECS.Entity.Relation, true);
  const details: ECS.RelationDetail = { sourceEntity: source, targetEntity: target, relationType, info };
  addAttribute(relId, AttrKind.RelationDetails, details);
  addToIndex(relationType, source, target, relId);
  return relId;
}

function updateAttribute(
  entityID: ECS.EntityId,
  kind: AttrKind,
  newValue: AttributeValue,
  index = 0,
) {
  const bucket = getBucket(kind);
  if (!bucket.has(entityID)) bucket.set(entityID, []);
  const list = bucket.get(entityID) ?? [];
  const current = list[index];
  list[index] = current && isPlainObject(current) && isPlainObject(newValue) ? { ...current, ...newValue } : newValue;
  logInternal("AU", false, kind, entityID, newValue);
}

const updateAttributeByCriteria = (
  id: ECS.EntityId,
  kind: AttrKind,
  criteria: AttributeValue,
  value: AttributeValue,
) => {
  const idx = getAttributeIndexByCriteria(id, kind, criteria);
  if (idx !== -1) updateAttribute(id, kind, value, idx);
};

const updateRole = (id: ECS.EntityId, oldR: string, newR: string) => updateAttributeByCriteria(id, AttrKind.Role, oldR, newR);

function updateRelation(
  relId: ECS.EntityId,
  newSource?: ECS.EntityId,
  newTarget?: ECS.EntityId,
  newInfo?: AttributeValue,
) {
  const d = getRelation(relId);
  if (!d) return;
  const { sourceEntity: oldS, targetEntity: oldT, relationType } = d;
  let touched = false;
  if (newSource && newSource !== oldS) { d.sourceEntity = newSource; touched = true; }
  if (newTarget && newTarget !== oldT) { d.targetEntity = newTarget; touched = true; }
  if (newInfo !== undefined) d.info = newInfo;
  updateAttribute(relId, AttrKind.RelationDetails, d);
  if (touched) updateIndex(relationType, relId, oldS, oldT, d.sourceEntity, d.targetEntity);
}

function removeAttribute(id: ECS.EntityId, kind: AttrKind, index = 0) {
  const bucket = store.get(kind);
  if (!bucket) return;
  const list = bucket.get(id);
  if (!list) return;
  const [removed] = list.splice(index, 1);
  if (!list.length) bucket.delete(id);
  logInternal("AR", false, kind, id, removed);
}

const removeAttributeByCriteria = (id: ECS.EntityId, kind: AttrKind, criteria: AttributeValue) => {
  const idx = getAttributeIndexByCriteria(id, kind, criteria);
  if (idx !== -1) removeAttribute(id, kind, idx);
};

function removeRelation(relId: ECS.EntityId) {
  const d = getRelation(relId);
  if (!d) return;
  removeFromIndex(d.relationType, d.sourceEntity, d.targetEntity, relId);
  destroyEntity(relId);
}

const removeRole = (id: ECS.EntityId, role: string) => removeAttributeByCriteria(id, AttrKind.Role, role);

/*-------------------------------------------------------------------------*\
| 3 ▸ Queries & helpers                                                     |
\*-------------------------------------------------------------------------*/
const getAttributes = (id: ECS.EntityId, kind: AttrKind): AttributeValue[] => store.get(kind)?.get(id) ?? [];
const getAttribute = (id: ECS.EntityId, kind: AttrKind, idx = 0) => getAttributes(id, kind)[idx] ?? null;
const getRoles = (id: ECS.EntityId): string[] => getAttributes(id, AttrKind.Role) as string[];
const hasRole = (id: ECS.EntityId, role: string) => getRoles(id).includes(role);
const getRelation = (relId: ECS.EntityId): ECS.RelationDetail | null => (getAttributes(relId, AttrKind.RelationDetails)[0] ?? null) as ECS.RelationDetail | null;

function getAttributeIndexByCriteria(id: ECS.EntityId, kind: AttrKind, criteria: AttributeValue) {
  return getAttributes(id, kind).findIndex((a) =>
    isPlainObject(criteria) ? Object.entries(criteria as Record<string, unknown>).every(([k, v]) => (a as Record<string, unknown>)[k] === v) : a === criteria,
  );
}

function queryEntitiesByAttribute(kind: AttrKind, criteria?: AttributeValue): ECS.EntityId[] {
  const bucket = store.get(kind);
  if (!bucket) return [];
  const ids = Array.from(bucket.keys());
  if (!criteria) return ids;
  return ids.filter((eid) => {
    const list = bucket.get(eid) ?? [];
    return isPlainObject(criteria)
      ? list.some((a) => Object.entries(criteria as Record<string, unknown>).every(([k, v]) => (a as Record<string, unknown>)[k] === v))
      : list.includes(criteria);
  });
}

const queryEntitiesByRole = (role: string) => queryEntitiesByAttribute(AttrKind.Role, role);

function queryEntitiesInRelationTo(target: ECS.EntityId): ECS.EntityId[] {
  const out = new Set<ECS.EntityId>();
  for (const relType of Object.keys(relationIndex)) {
    const { bySource, byTarget } = relationIndex[relType];
    const srcSet = bySource[target];
    if (srcSet) {
      for (const relId of srcSet) {
        const d = getRelation(relId);
        if (d) out.add(d.targetEntity);
      }
    }
    const tgtSet = byTarget[target];
    if (tgtSet) {
      for (const relId of tgtSet) {
        const d = getRelation(relId);
        if (d) out.add(d.sourceEntity);
      }
    }
  }
  return [...out];
}

function queryEntitiesByRelationTo(relationType: RelationKind, entityID: ECS.EntityId, isSource = false): ECS.EntityId[] {
  const set = relationIndex[relationType]?.[isSource ? "bySource" : "byTarget"][entityID];
  if (!set) return [];
  const res: ECS.EntityId[] = [];
  for (const relId of set) {
    const d = getRelation(relId);
    if (d) res.push(isSource ? d.targetEntity : d.sourceEntity);
  }
  return res;
}

/*-------------------------------------------------------------------------*\
| 4 ▸ Entity teardown                                                       |
\*-------------------------------------------------------------------------*/
function destroyEntity(entityID: ECS.EntityId): void {
  for (const relType of Object.keys(relationIndex)) {
    const { bySource, byTarget } = relationIndex[relType];
    for (const dir of [bySource, byTarget]) {
      const set = dir[entityID];
      if (!set) continue;
      for (const relId of set) {
        const d = getRelation(relId);
        if (!d) continue;
        removeFromIndex(relType, d.sourceEntity, d.targetEntity, relId);
        removeAttribute(relId, AttrKind.RelationDetails);
      }
      delete dir[entityID];
    }
  }
  for (const kind of store.keys()) store.get(kind)?.delete(entityID);
}

/*-------------------------------------------------------------------------*\
| 5 ▸ Public surface                                                        |
\*-------------------------------------------------------------------------*/
export {
  destroyEntity,
  addAttribute,
  addRole,
  addRelation,
  updateAttribute,
  updateAttributeByCriteria,
  updateRole,
  updateRelation,
  removeAttribute,
  removeAttributeByCriteria,
  removeRole,
  removeRelation,
  getAttributes,
  getAttribute,
  getRoles,
  hasRole,
  getRelation,
  queryEntitiesByAttribute,
  queryEntitiesByRole,
  queryEntitiesInRelationTo,
  queryEntitiesByRelationTo,
};
