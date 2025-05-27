// /*───────────────────────────────────────────────────────────────────────────
//  * attribute-store.graphology.ts – Same public API, Graphology‑powered engine
//  *───────────────────────────────────────────────────────────────────────────*/
// import Graph from 'graphology';
// import { addNodeAttributeIndex } from 'graphology-indexes';
// import { isPlainObject } from '@/shared/utils';
// import { logInternal } from '@/shared/debug/log';
// import { createEntity as _createEntity } from './create-entity';
// import { EARS } from './types';

// /*-------------------------------------------------------------------------*\
// |   ▸ Internal graph & indexes                                              |
// \*-------------------------------------------------------------------------*/
// const graph = new Graph({ type: 'directed', multi: true });

// /** Secondary per‑kind attribute indexes (lazy created) */
// const attrIndexes = new Map<EARS.AttrKind, ReturnType<typeof addNodeAttributeIndex>>();
// const ensureAttrIndex = (kind: EARS.AttrKind) => {
//   if (!attrIndexes.has(kind)) attrIndexes.set(kind, addNodeAttributeIndex(graph, kind as string));
//   return attrIndexes.get(kind);
// };

// /** Entity‑type → Set<EntityId>  (O(1) getEntitiesOfType) */
// const typeIndex = new Map<EARS.Entity, Set<EARS.EntityId>>();
// const addToTypeIndex = (id: EARS.EntityId, t?: EARS.Entity) => {
//   if (!t) return;
//   if (!typeIndex.has(t)) typeIndex.set(t, new Set());
//   typeIndex.get(t)?.add(id);
// };
// const removeFromTypeIndex = (id: EARS.EntityId, t?: EARS.Entity) => {
//   if (!t) return;
//   const bucket = typeIndex.get(t);
//   if (!bucket) return;
//   bucket.delete(id);
//   if (!bucket.size) typeIndex.delete(t);
// };

// /*-------------------------------------------------------------------------*\
// |   ▸ Helpers                                                               |
// \*-------------------------------------------------------------------------*/
// function ensureNode(id: EARS.EntityId, type?: EARS.Entity) {
//   if (!graph.hasNode(id)) {
//     graph.addNode(id, { type });
//     addToTypeIndex(id, type);
//   }
// }

// function attrBucket(nodeId: EARS.EntityId, kind: EARS.AttrKind): EARS.AttributeValue[] {
//   const list = (graph.getNodeAttribute(nodeId, kind) as EARS.AttributeValue[]) ?? [];
//   if (!list.length) graph.setNodeAttribute(nodeId, kind, list);
//   return list;
// }

// /*-------------------------------------------------------------------------*\
// |   ▸ Core mutators (nodes)                                                 |
// \*-------------------------------------------------------------------------*/
// function addAttribute(id: EARS.EntityId, kind: EARS.AttrKind, value: EARS.AttributeValue) {
//   ensureNode(id, entityTypeOf(id));
//   attrBucket(id, kind).push(value);
//   ensureAttrIndex(kind); // create index ahead of time (kept in sync by lib)
//   logInternal('AA', false, kind, id, value);
// }

// const addRole = (id: EARS.EntityId, role: string) => addAttribute(id, EARS.AttrKind.Role, role);

// function updateAttribute(
//   id: EARS.EntityId,
//   kind: EARS.AttrKind,
//   newValue: EARS.AttributeValue,
//   index = 0,
// ) {
//   const list = attrBucket(id, kind);
//   if (index < 0) return;
//   if (index >= list.length) list.push(newValue);
//   else {
//     const current = list[index];
//     list[index] = current && isPlainObject(current) && isPlainObject(newValue)
//       ? { ...current, ...newValue }
//       : newValue;
//   }
//   logInternal('AU', false, kind, id, newValue);
// }

// function updateAttributeByCriteria(
//   id: EARS.EntityId,
//   kind: EARS.AttrKind,
//   criteria: EARS.AttributeValue,
//   newValue: EARS.AttributeValue,
// ) {
//   const idx = getAttributeIndexByCriteria(id, kind, criteria);
//   if (idx !== -1) updateAttribute(id, kind, newValue, idx);
// }

// const updateRole = (id: EARS.EntityId, oldR: string, newR: string) =>
//   updateAttributeByCriteria(id, EARS.AttrKind.Role, oldR, newR);

// /*-------------------------------------------------------------------------*\
// |   ▸ Relations = graph edges                                              |
// \*-------------------------------------------------------------------------*/
// function addRelation(
//   source: EARS.EntityId,
//   relationType: string,
//   target: EARS.EntityId,
//   info?: EARS.AttributeValue,
// ): EARS.EntityId {
//   ensureNode(source, entityTypeOf(source));
//   ensureNode(target, entityTypeOf(target));
//   const relId = _createEntity(EARS.Entity.Relation);
//   graph.addDirectedEdgeWithKey(relId, source, target, { relationType, info });
//   addAttribute(relId, EARS.AttrKind.RelationDetails, {
//     sourceEntity: source,
//     targetEntity: target,
//     relationType,
//     info,
//   });
//   return relId;
// }

// function getRelation(relId: EARS.EntityId): EARS.RelationDetail | null {
//   if (!graph.hasEdge(relId)) return null;
//   return {
//     sourceEntity: graph.source(relId) as EARS.EntityId,
//     targetEntity: graph.target(relId) as EARS.EntityId,
//     relationType: graph.getEdgeAttribute(relId, 'relationType'),
//     info: graph.getEdgeAttribute(relId, 'info'),
//   };
// }

// function updateRelation(
//   relId: EARS.EntityId,
//   newSource?: EARS.EntityId,
//   newTarget?: EARS.EntityId,
//   newInfo?: EARS.AttributeValue,
// ) {
//   if (!graph.hasEdge(relId)) return;
//   const cur = getRelation(relId);
//   if (!cur) return;

//   const src = newSource ?? cur.sourceEntity;
//   const tgt = newTarget ?? cur.targetEntity;

//   if (src !== cur.sourceEntity || tgt !== cur.targetEntity) {
//     graph.dropEdge(relId);
//     graph.addDirectedEdgeWithKey(relId, src, tgt, {
//       relationType: cur.relationType,
//       info: newInfo ?? cur.info,
//     });
//   } else if (newInfo !== undefined) {
//     graph.setEdgeAttribute(relId, 'info', newInfo);
//   }

//   updateAttribute(relId, EARS.AttrKind.RelationDetails, {
//     sourceEntity: src,
//     targetEntity: tgt,
//     relationType: cur.relationType,
//     info: newInfo ?? cur.info,
//   });
// }

// function removeRelation(relId: EARS.EntityId) {
//   if (graph.hasEdge(relId)) graph.dropEdge(relId);
//   destroyEntity(relId);
// }

// /*-------------------------------------------------------------------------*\
// |   ▸ Removal helpers                                                       |
// \*-------------------------------------------------------------------------*/
// function removeAttribute(
//   id: EARS.EntityId,
//   kind: EARS.AttrKind,
//   index = 0,
// ): EARS.AttributeValue | undefined {
//   const list = attrBucket(id, kind);
//   const [removed] = list.splice(index, 1);
//   if (!list.length) graph.removeNodeAttribute(id, kind);
//   logInternal('AR', false, kind, id, removed);
//   return removed;
// }

// function removeAttributeByCriteria(
//   id: EARS.EntityId,
//   kind: EARS.AttrKind,
//   criteria: EARS.AttributeValue,
// ) {
//   const idx = getAttributeIndexByCriteria(id, kind, criteria);
//   if (idx !== -1) removeAttribute(id, kind, idx);
// }

// const removeRole = (id: EARS.EntityId, role: string) =>
//   removeAttributeByCriteria(id, EARS.AttrKind.Role, role);

// /*-------------------------------------------------------------------------*\
// |   ▸ Queries                                                               |
// \*-------------------------------------------------------------------------*/
// const matches = (criteria: EARS.AttributeValue) => (attr: EARS.AttributeValue) =>
//   isPlainObject(criteria)
//     // biome-ignore lint/suspicious/noExplicitAny: <explanation>
//     ? Object.entries(criteria).every(([k, v]) => (attr as any)[k] === v)
//     : attr === criteria;

// function getAttributesOfKind(id: EARS.EntityId, kind: EARS.AttrKind) {
//   return (graph.getNodeAttribute(id, kind) as EARS.AttributeValue[]) ?? [];
// }

// const getAttribute = (id: EARS.EntityId, kind: EARS.AttrKind, idx = 0) =>
//   getAttributesOfKind(id, kind)[idx] ?? null;

// function getAttributeIndexByCriteria(
//   id: EARS.EntityId,
//   kind: EARS.AttrKind,
//   c: EARS.AttributeValue,
// ) {
//   return getAttributesOfKind(id, kind).findIndex(matches(c));
// }

// const getRoles = (id: EARS.EntityId) => getAttributesOfKind(id, EARS.AttrKind.Role) as string[];
// const hasRole = (id: EARS.EntityId, role: string) => getRoles(id).includes(role);
// const hasRoleX = (role: string) => (item: EARS.AttributeValue) => hasRole(item, role);

// function queryEntitiesByAttribute(kind: EARS.AttrKind, criteria?: EARS.AttributeValue): EARS.EntityId[] {
//   // Fast path using secondary index
//   if (criteria !== undefined && attrIndexes.has(kind)) {
//     const idx = ensureAttrIndex(kind);
//     const set = idx.get(criteria);
//     if (set) return [...set] as EARS.EntityId[];
//     return [];
//   }

//   // Fallback scan
//   const out: EARS.EntityId[] = [];
//   graph.forEachNode((id, attrs) => {
//     const list = (attrs[kind] as EARS.AttributeValue[]) ?? [];
//     if (!criteria ? list.length : list.some(matches(criteria))) out.push(id as EARS.EntityId);
//   });
//   return out;
// }

// const queryEntitiesByRole = (role: string) => queryEntitiesByAttribute(EARS.AttrKind.Role, role);

// function queryEntitiesInRelationTo(target: EARS.EntityId): EARS.EntityId[] {
//   const out = new Set<EARS.EntityId>();
//   graph.forEachInEdge(target, (_e, _attrs, src) => out.add(src as EARS.EntityId));
//   graph.forEachOutEdge(target, (_e, _attrs, _src, tgt) => out.add(tgt as EARS.EntityId));
//   return [...out];
// }

// function queryEntitiesByRelationTo(
//   relationType: string,
//   id: EARS.EntityId,
//   isSource = false,
// ): EARS.EntityId[] {
//   const out: EARS.EntityId[] = [];
//   const iter = isSource ? graph.outEdges(id) : graph.inEdges(id);
//   for (const edge of iter) {
//     if (graph.getEdgeAttribute(edge, 'relationType') === relationType) {
//       out.push((isSource ? graph.target(edge) : graph.source(edge)) as EARS.EntityId);
//     }
//   }
//   return out;
// }

// /*-------------------------------------------------------------------------*\
// |   ▸ Entity helpers & teardown                                             |
// \*-------------------------------------------------------------------------*/
// function entityTypeOf(id: EARS.EntityId): EARS.Entity | undefined {
//   const [prefix] = id.split('-');
//   return (Object.values(EARS.Entity) as string[]).includes(prefix) ? (prefix as EARS.Entity) : undefined;
// }

// function getEntitiesOfType(entityType: EARS.Entity): EARS.EntityId[] {
//   return [...(typeIndex.get(entityType) ?? [])] as EARS.EntityId[];
// }

// function getAllEntities(): EARS.EntityId[] {
//   return graph.nodes() as EARS.EntityId[];
// }

// function destroyEntity(id: EARS.EntityId) {
//   const t = graph.getNodeAttribute(id, 'type') as EARS.Entity | undefined;
//   removeFromTypeIndex(id, t);
//   graph.dropNode(id);
// }

// /*-------------------------------------------------------------------------*\
// |   ▸ Public re‑exports (API compatibility                                  |
// \*-------------------------------------------------------------------------*/
// export {
//   addAttribute,
//   addRole,
//   addRelation,
//   updateAttribute,
//   updateAttributeByCriteria,
//   updateRole,
//   updateRelation,
//   removeAttribute,
//   removeAttributeByCriteria,
//   removeRole,
//   removeRelation,
//   getAttributesOfKind,
//   getAttribute,
//   getRoles,
//   hasRole,
//   hasRoleX,
//   getRelation,
//   queryEntitiesByAttribute,
//   queryEntitiesByRole,
//   queryEntitiesInRelationTo,
//   queryEntitiesByRelationTo,
//   destroyEntity,
//   _createEntity as createEntity,
//   getAllEntities,
//   getEntitiesOfType,
// };
