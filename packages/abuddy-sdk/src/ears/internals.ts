// The EARS engine's write side and untyped helpers for the host. Packs query the engine through
// @abuddy/sdk/ears; @abuddy/host/ears re-exports this module. The package exports it only under
// the @abuddy/source condition, so it isn't reachable from the published package.
export {
  initEARSRuntime, setPersistence, getPersistence, getEntityTypeChecker,
  type PersistenceSink, type Logger,
} from './runtime.js';
export {
  putAttr, addAttr, mergeAttr, dropAttr, dropIf, updateAttr,
  bulkLoadAttr,
  addRelation, updateRelation,
  getAllEntities,
  queryEntitiesByAttribute, queryEntitiesByRelationTo, queryEntitiesInRelationTo,
  queryEntitiesByRole,
  clearMemory,
} from './attribute-storage.js';
export { edgeStore } from './edge-store.js';
export { relationIndex, addToIndex, removeFromIndex, updateIndex, clearRelationIndex } from './relation-index.js';
export { filterSystemFields } from './helpers.js';
export { _flushEarlyRegistrations } from './repository.js';
// Untyped query helpers for host code; packs get them typed from defineEars (see ./typed)
export { qx } from './query.js';
export { createEntity } from './attribute-storage.js';
export { findById, findByIdRaw, findAll, findWhere, findFirst } from './query-helpers.js';
