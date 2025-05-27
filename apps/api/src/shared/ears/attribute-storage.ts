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
  id: EARS.EntityId,
  kind: EARS.AttrKind,
  value: EARS.AttributeValue,
): void {
  const b = bucket(kind);
  if (!b.has(id)) b.set(id, []);
  const attributes = b.get(id);
  if (attributes) attributes.push(value); // multiple attrs of same kind allowed
  addEntityToIndex(id);
  logInternal("AA", false, kind, id, value);
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
  id: EARS.EntityId,
  kind: EARS.AttrKind,
  newValue: EARS.AttributeValue,
  index = 0,
): void {
  const b = bucket(kind);
  if (!b.has(id)) b.set(id, []);
  const list = b.get(id) || [];
  if (index < 0) return;
  if (index >= list.length) list.push(newValue);
  else {
    const current = list[index];
    list[index] =
      current && isPlainObject(current) && isPlainObject(newValue)
        ? { ...current, ...newValue }
        : newValue;
  }
  logInternal("AU", false, kind, id, newValue);
}

function updateAttributeByCriteria(
  id: EARS.EntityId,
  kind: EARS.AttrKind,
  criteria: EARS.AttributeValue,
  newValue: EARS.AttributeValue,
) {
  const idx = getAttributeIndexByCriteria(id, kind, criteria);
  if (idx !== -1) updateAttribute(id, kind, newValue, idx);
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
  id: EARS.EntityId,
  kind: EARS.AttrKind,
  index = 0,
): EARS.AttributeValue | undefined {
  const kindBucket = store.get(kind);
  const list = kindBucket?.get(id);
  if (!list) return undefined;
  const [removed] = list.splice(index, 1);
  if (!list.length && kindBucket) kindBucket.delete(id);
  logInternal("AR", false, kind, id, removed);
  return removed;
}

function removeAttributeByCriteria(
  id: EARS.EntityId,
  kind: EARS.AttrKind,
  criteria: EARS.AttributeValue,
) {
  const idx = getAttributeIndexByCriteria(id, kind, criteria);
  if (idx !== -1) removeAttribute(id, kind, idx);
}

function removeRelation(relId: EARS.EntityId): void {
  const d = getRelation(relId);
  if (!d) return;
  removeFromIndex(d.relationType, d.sourceEntity, d.targetEntity, relId);
  destroyEntity(relId);
}

function removeRole(id: EARS.EntityId, role: string) {
  removeAttributeByCriteria(id, EARS.AttrKind.Role, role);
}

/*-------------------------------------------------------------------------*\
|   ▸ Look‑ups / queries                                                    |
\*-------------------------------------------------------------------------*/
const matches = (criteria: EARS.AttributeValue) => (attr: EARS.AttributeValue) =>
  isPlainObject(criteria)
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    ? Object.entries(criteria).every(([k, v]) => (attr as any)[k] === v)
    : attr === criteria;

function getAttributesOfKind(id: EARS.EntityId, kind: EARS.AttrKind) {
  return store.get(kind)?.get(id) ?? [];
}

function getAttribute(id: EARS.EntityId, kind: EARS.AttrKind, idx = 0) {
  return getAttributesOfKind(id, kind)[idx] ?? null;
}

type EntityAttributes = Record<
  EARS.AttrKind,
  EARS.AttributeValue | EARS.AttributeValue[]
>;
function getAllAttributes(id: EARS.EntityId): EntityAttributes {
  // result is an object where key is kind, is a single attribute value or an array of attributes
  const result: EntityAttributes = {} as EntityAttributes;
  for (const kind of store.keys()) {
    const attributes = getAttributesOfKind(id, kind);
    if (attributes.length === 0) continue;
    result[kind] = attributes.length === 1 ? attributes[0] : attributes;
  }
  return result;
}

function getAttributeIndexByCriteria(
  id: EARS.EntityId,
  kind: EARS.AttrKind,
  c: EARS.AttributeValue,
) {
  return getAttributesOfKind(id, kind).findIndex(matches(c));
}

function getRoles(id: EARS.EntityId) {
  return getAttributesOfKind(id, EARS.AttrKind.Role) as string[];
}
function hasRole(id: EARS.EntityId, role: string) {
  return getRoles(id).includes(role);
}
function hasRoleX(role: string) {
  return (item: EARS.AttributeValue) => hasRole(item, role);
}

function getRelation(relId: EARS.EntityId): EARS.RelationDetail | null {
  return getAttributesOfKind(relId, EARS.AttrKind.RelationDetails)[0] ??
    null;
}

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

function queryEntitiesByRole(role: string) {
  return queryEntitiesByAttribute(EARS.AttrKind.Role, role);
}

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
  id: EARS.EntityId,
  isSource = false,
): EARS.EntityId[] {
  const ids =
    relationIndex[relationType]?.[isSource ? "bySource" : "byTarget"][
      id
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
function destroyEntity(id: EARS.EntityId): void {
  for (const relType of Object.keys(relationIndex)) {
    const { bySource, byTarget } = relationIndex[relType];
    for (const dir of [bySource, byTarget]) {
      const relIds = dir[id] ?? [];
      for (const relId of relIds) {
        const d = getRelation(relId);
        if (d) removeFromIndex(relType, d.sourceEntity, d.targetEntity, relId);
        removeAttribute(relId, EARS.AttrKind.RelationDetails);
      }
      delete dir[id];
    }
  }
  for (const kind of store.keys()) bucket(kind).delete(id);
  removeEntityFromIndex(id);
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
  getAttributesOfKind,
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
  getAllAttributes,
};
