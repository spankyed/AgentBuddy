/*───────────────────────────────────────────────────────────────────────────
 * attribute-store.ts – Map‑backed, AttrKind‑typed (multi‑value safe)
 *───────────────────────────────────────────────────────────────────────────*/
import { isPlainObject } from "@/shared/utils";
import { logInternal } from "@/shared/debug/log";
import { createEntity } from "./create-entity";
import {
  addToIndex,
  removeFromIndex,
  updateIndex,
  relationIndex,
} from "./relation-index";
import { EARS } from "./types";

/*-------------------------------------------------------------------------*\
|   ▸ Internal store                                                        |
\*-------------------------------------------------------------------------*/
const store = new Map<EARS.AttrKind, Map<EARS.EntityId, EARS.AttributeValue[]>>();
const entityIndex = new Map<EARS.Entity, Set<EARS.EntityId>>();

/**
 * Helper: deduce the entity type from its ID (assumes IDs are prefixed with the
 * entity type followed by a dash, e.g. `Thread-abc123`). If the prefix does not
 * correspond to a valid `EARS.Entity`, we return `undefined` so the caller can
 * safely ignore it.
 */
function entityTypeOf(id: EARS.EntityId): EARS.Entity | undefined {
  const [prefix] = id.split("-");
  return (Object.values(EARS.Entity) as string[]).includes(prefix)
    ? (prefix as EARS.Entity)
    : undefined;
}

function addEntityToIndex(id: EARS.EntityId): void {
  const type = entityTypeOf(id);
  if (!type) return;
  if (!entityIndex.has(type)) entityIndex.set(type, new Set());
  entityIndex.get(type)?.add(id);
}

function removeEntityFromIndex(id: EARS.EntityId): void {
  const type = entityTypeOf(id);
  if (!type) return;
  const bucket = entityIndex.get(type);
  if (!bucket) return;
  bucket.delete(id);
  if (!bucket.size) entityIndex.delete(type);
};

function bucket(kind: EARS.AttrKind) {
  if (!store.has(kind)) store.set(kind, new Map());
  return store.get(kind) as Map<EARS.EntityId, EARS.AttributeValue[]>;
};

/*-------------------------------------------------------------------------*\
|   ▸ Core mutators                                                         |
\*-------------------------------------------------------------------------*/
function addAttribute(
  entityID: EARS.EntityId,
  kind: EARS.AttrKind,
  value: EARS.AttributeValue,
): void {
  const b = bucket(kind);
  if (!b.has(entityID)) b.set(entityID, []);
  const attributes = b.get(entityID);
  if (attributes) attributes.push(value); // multiple attrs of same kind allowed
  addEntityToIndex(entityID);
  logInternal("AA", false, kind, entityID, value);
}

function addRole(id: EARS.EntityId, role: string) {
  addAttribute(id, EARS.AttrKind.Role, role);
}

function addRelation(
  source: EARS.EntityId,
  relationType: string,
  target: EARS.EntityId,
  info?: EARS.AttributeValue,
): EARS.EntityId {
  const relId = createEntity(EARS.Entity.Relation);
  const details: EARS.RelationDetail = {
    sourceEntity: source,
    targetEntity: target,
    relationType,
    info,
  };
  addAttribute(relId, EARS.AttrKind.RelationDetails, details);
  addToIndex(relationType, source, target, relId);
  return relId;
}

function updateAttribute(
  entityID: EARS.EntityId,
  kind: EARS.AttrKind,
  newValue: EARS.AttributeValue,
  index = 0,
): void {
  const b = bucket(kind);
  if (!b.has(entityID)) b.set(entityID, []);
  const list = b.get(entityID) || [];
  if (index < 0) return;
  if (index >= list.length) list.push(newValue);
  else {
    const current = list[index];
    list[index] =
      current && isPlainObject(current) && isPlainObject(newValue)
        ? { ...current, ...newValue }
        : newValue;
  }
  logInternal("AU", false, kind, entityID, newValue);
}

function updateAttributeByCriteria(
  entityID: EARS.EntityId,
  kind: EARS.AttrKind,
  criteria: EARS.AttributeValue,
  newValue: EARS.AttributeValue,
) {
  const idx = getAttributeIndexByCriteria(entityID, kind, criteria);
  if (idx !== -1) updateAttribute(entityID, kind, newValue, idx);
}

const updateRole = (id: EARS.EntityId, oldR: string, newR: string) =>
  updateAttributeByCriteria(id, EARS.AttrKind.Role, oldR, newR);

function updateRelation(
  relId: EARS.EntityId,
  newSource?: EARS.EntityId,
  newTarget?: EARS.EntityId,
  newInfo?: EARS.AttributeValue,
): void {
  const d = getRelation(relId);
  if (!d) return;
  const { sourceEntity: oldS, targetEntity: oldT, relationType } = d;
  let touched = false;
  if (newSource && newSource !== oldS) {
    d.sourceEntity = newSource;
    touched = true;
  }
  if (newTarget && newTarget !== oldT) {
    d.targetEntity = newTarget;
    touched = true;
  }
  if (newInfo !== undefined) d.info = newInfo;
  updateAttribute(relId, EARS.AttrKind.RelationDetails, d);
  if (touched)
    updateIndex(
      relationType,
      relId,
      oldS,
      oldT,
      d.sourceEntity,
      d.targetEntity,
    );
}

/*-------------------------------------------------------------------------*\
|   ▸ Removal helpers                                                       |
\*-------------------------------------------------------------------------*/
function removeAttribute(
  entityID: EARS.EntityId,
  kind: EARS.AttrKind,
  index = 0,
): EARS.AttributeValue | undefined {
  const kindBucket = store.get(kind);
  const list = kindBucket?.get(entityID);
  if (!list) return undefined;
  const [removed] = list.splice(index, 1);
  if (!list.length && kindBucket) kindBucket.delete(entityID);
  logInternal("AR", false, kind, entityID, removed);
  return removed;
}

const removeAttributeByCriteria = (
  id: EARS.EntityId,
  kind: EARS.AttrKind,
  criteria: EARS.AttributeValue,
) => {
  const idx = getAttributeIndexByCriteria(id, kind, criteria);
  if (idx !== -1) removeAttribute(id, kind, idx);
};

function removeRelation(relId: EARS.EntityId): void {
  const d = getRelation(relId);
  if (!d) return;
  removeFromIndex(d.relationType, d.sourceEntity, d.targetEntity, relId);
  destroyEntity(relId);
}

const removeRole = (id: EARS.EntityId, role: string) =>
  removeAttributeByCriteria(id, EARS.AttrKind.Role, role);

/*-------------------------------------------------------------------------*\
|   ▸ Look‑ups / queries                                                    |
\*-------------------------------------------------------------------------*/
const matches = (criteria: EARS.AttributeValue) => (attr: EARS.AttributeValue) =>
  isPlainObject(criteria)
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    ? Object.entries(criteria).every(([k, v]) => (attr as any)[k] === v)
    : attr === criteria;

function getAttributes(entityID: EARS.EntityId, kind: EARS.AttrKind) {
  return store.get(kind)?.get(entityID) ?? [];
}

const getAttribute = (id: EARS.EntityId, kind: EARS.AttrKind, idx = 0) =>
  getAttributes(id, kind)[idx] ?? null;

const getAttributeIndexByCriteria = (
  id: EARS.EntityId,
  kind: EARS.AttrKind,
  c: EARS.AttributeValue,
) => getAttributes(id, kind).findIndex(matches(c));

const getRoles = (id: EARS.EntityId) =>
  getAttributes(id, EARS.AttrKind.Role) as string[];
const hasRole = (id: EARS.EntityId, role: string) => getRoles(id).includes(role);
const hasRoleX = (role: string) => (item: EARS.AttributeValue) =>
  hasRole(item, role);

const getRelation = (relId: EARS.EntityId): EARS.RelationDetail | null =>
  (getAttributes(relId, EARS.AttrKind.RelationDetails)[0] ??
    null) as EARS.RelationDetail | null;

function queryEntitiesByAttribute(
  kind: EARS.AttrKind,
  criteria?: EARS.AttributeValue,
): EARS.EntityId[] {
  const b = store.get(kind);
  if (!b) return [];
  if (!criteria) return Array.from(b.keys());
  return Array.from(b.entries())
    .filter(([, list]) => list.some(matches(criteria)))
    .map(([id]) => id);
}

const queryEntitiesByRole = (role: string) =>
  queryEntitiesByAttribute(EARS.AttrKind.Role, role);

function queryEntitiesInRelationTo(target: EARS.EntityId): EARS.EntityId[] {
  const out = new Set<EARS.EntityId>();
  for (const relType of Object.keys(relationIndex)) {
    const { bySource, byTarget } = relationIndex[relType];
    for (const relId of bySource[target] ?? []) {
      const d = getRelation(relId);
      if (d) out.add(d.targetEntity);
    }
    for (const relId of byTarget[target] ?? []) {
      const d = getRelation(relId);
      if (d) out.add(d.sourceEntity);
    }
  }
  return [...out];
}

function queryEntitiesByRelationTo(
  relationType: string,
  entityID: EARS.EntityId,
  isSource = false,
): EARS.EntityId[] {
  const ids =
    relationIndex[relationType]?.[isSource ? "bySource" : "byTarget"][
      entityID
    ] ?? [];
  return ids
    .map((relId) => {
      const d = getRelation(relId);
      return isSource ? d?.targetEntity : d?.sourceEntity;
    })
    .filter(Boolean) as EARS.EntityId[];
}

/*-------------------------------------------------------------------------*\
|   ▸ Entity teardown                                                       |
\*-------------------------------------------------------------------------*/
function destroyEntity(entityID: EARS.EntityId): void {
  for (const relType of Object.keys(relationIndex)) {
    const { bySource, byTarget } = relationIndex[relType];
    for (const dir of [bySource, byTarget]) {
      const relIds = dir[entityID] ?? [];
      for (const relId of relIds) {
        const d = getRelation(relId);
        if (d) removeFromIndex(relType, d.sourceEntity, d.targetEntity, relId);
        removeAttribute(relId, EARS.AttrKind.RelationDetails);
      }
      delete dir[entityID];
    }
  }
  for (const kind of store.keys()) bucket(kind).delete(entityID);
  removeEntityFromIndex(entityID);
}

/*-------------------------------------------------------------------------*\
|   ▸ Entity retrieval                                                      |
\*-------------------------------------------------------------------------*/
function getAllEntities(): EARS.EntityId[] {
  const result: EARS.EntityId[] = [];
  for (const ids of entityIndex.values()) result.push(...ids);
  return result;
}

function getEntitiesOfType(entityType: EARS.Entity): EARS.EntityId[] {
  return Array.from(entityIndex.get(entityType) ?? []);
}

/*-------------------------------------------------------------------------*\
|   ▸ Public exports                                                        |
\*-------------------------------------------------------------------------*/
export {
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
  hasRoleX,
  getRelation,
  queryEntitiesByAttribute,
  queryEntitiesByRole,
  queryEntitiesInRelationTo,
  queryEntitiesByRelationTo,
  destroyEntity,
  createEntity,
  getAllEntities,
  getEntitiesOfType,
};
