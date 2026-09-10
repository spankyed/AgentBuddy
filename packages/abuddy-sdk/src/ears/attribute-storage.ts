import { relationIndex, addToIndex, removeFromIndex, updateIndex, clearRelationIndex } from './relation-index';
import { EARS } from '../types/entities';
// Import directly — not from '../utils' barrel which pulls in Node-only modules (fs, child_process)
import { randomId } from '../utils/random-id';
import { getPersistence } from './runtime';

const isPlainObject = (val: unknown): val is Record<string, unknown> =>
  typeof val === 'object' && val !== null && !Array.isArray(val);

export const createEntity = (t: EARS.Entity) =>
  `${t}-${randomId()}` as EARS.EntityId;

const store       = new Map<EARS.AttrKind, Map<EARS.EntityId, EARS.AttributeValue[]>>();
const entityIndex = new Map<EARS.Entity, Set<EARS.EntityId>>();

export function clearMemory() {
  store.clear();
  entityIndex.clear();
  clearRelationIndex();
}

const bucket = (k: EARS.AttrKind) => {
  if (!store.has(k)) store.set(k, new Map());
  return store.get(k)!;
};
const entType = (id: EARS.EntityId) => {
  const dash = id.indexOf('-');
  return dash === -1 ? id as unknown as EARS.Entity : id.substring(0, dash) as EARS.Entity;
};

function makeMutator() {
  const add = (id: EARS.EntityId, kind: EARS.AttrKind, val: unknown) => {
    const b = bucket(kind);
    (b.get(id) ?? b.set(id, []).get(id)!).push(val as EARS.AttributeValue);
    (entityIndex.get(entType(id)) ?? (entityIndex.set(entType(id), new Set()), entityIndex.get(entType(id)))!)
      .add(id);
    const list = b.get(id)!;
    getPersistence().onPutAttrArray?.(kind, id, list);
  };

  const put = (id: EARS.EntityId, kind: EARS.AttrKind, val: unknown) => {
    const b = bucket(kind);
    b.set(id, [val as EARS.AttributeValue]);
    (entityIndex.get(entType(id)) ?? (entityIndex.set(entType(id), new Set()), entityIndex.get(entType(id)))!)
      .add(id);
    getPersistence().onPutAttrArray?.(kind, id, [val]);
  };

  const merge = (id: EARS.EntityId, kind: EARS.AttrKind, val: unknown, idx = 0) => {
    const b = bucket(kind);
    let list = b.get(id);
    if (!list) {
      list = [];
      b.set(id, list);
      (entityIndex.get(entType(id)) ?? (entityIndex.set(entType(id), new Set()), entityIndex.get(entType(id)))!)
        .add(id);
    }
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
    getPersistence().onPutAttrArray?.(kind, id, list);
  };

  const drop = (id: EARS.EntityId, kind: EARS.AttrKind, idx = 0) => {
    const list = bucket(kind).get(id);
    if (!list?.length) return;
    list.splice(idx, 1);
    if (!list.length) {
      bucket(kind).delete(id);
      getPersistence().onDropAttr(kind, id, idx, []);
    } else {
      getPersistence().onPutAttrArray?.(kind, id, list);
    }
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

  const update = put;

  return { add, put, merge, drop, dropIf, update };
}

export const { put: putAttr, add: addAttr, merge: mergeAttr, drop: dropAttr, dropIf, update: updateAttr } =
  makeMutator();

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
  const entry = relationIndex[kind];
  if (entry?.bySource?.[src] && entry?.byTarget?.[tgt]) {
    const fromSource = new Set(entry.bySource[src]);
    const fromTarget = new Set(entry.byTarget[tgt]);
    for (const existingRelId of fromSource) {
      if (fromTarget.has(existingRelId)) {
        const existingRel = getAttr(existingRelId, EARS.AttrKind.RelationDetails) as EARS.RelationDetail;
        if (info === undefined || JSON.stringify(existingRel.info) === JSON.stringify(info)) {
          // Relation already exists with same (src, kind, tgt, info) — reuse it
          return existingRelId;
        }
      }
    }
  }
  const relId = createEntity(EARS.Entity.Relation);
  putAttr(relId, EARS.AttrKind.RelationDetails, {
    sourceEntity: src,
    targetEntity: tgt,
    relationType: kind,
    info,
  } as EARS.RelationDetail);
  addToIndex(kind, src, tgt, relId);
  getPersistence().onAddRelation(relId, kind, src, tgt, info);
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
  const patch: any = {};
  if (newS) patch.src = newS;
  if (newT) patch.tgt = newT;
  if (info !== undefined) patch.info = info;
  getPersistence().onUpdateRelation(relId, patch);
}

export const removeRelation = (relId: EARS.EntityId) => {
  const d = getAttr(
    relId,
    EARS.AttrKind.RelationDetails,
  ) as EARS.RelationDetail | null;
  if (d)
    removeFromIndex(d.relationType, d.sourceEntity, d.targetEntity, relId);
  dropAttr(relId, EARS.AttrKind.RelationDetails);
  getPersistence().onRemoveRelation(relId);
};

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

export function destroyEntity(id: EARS.EntityId, skipPersistence = false) {
  for (const k of Object.keys(relationIndex)) {
    const { bySource, byTarget } = relationIndex[k];
    const relIds = [...(bySource[id] ?? []), ...(byTarget[id] ?? [])];
    relIds.forEach(removeRelation);
    delete bySource[id];
    delete byTarget[id];
  }
  for (const [_k, b] of store) b.delete(id);
  const entitySet = entityIndex.get(entType(id));
  if (entitySet) {
    entitySet.delete(id);
    if (entitySet.size === 0) {
      entityIndex.delete(entType(id));
    }
  }
  if (!skipPersistence) {
    getPersistence().onDestroyEntity(id);
  }
}

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
