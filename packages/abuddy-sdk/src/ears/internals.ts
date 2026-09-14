// The EARS engine's write side and untyped helpers for the host. Packs query the engine through
// @abuddy/sdk/ears; @abuddy/host/ears re-exports this module. The package exports it only under
// the @abuddy/source condition, so it isn't reachable from the published package.
export {
  initEARSRuntime, setPersistence, getPersistence, getEntityTypeChecker,
  type PersistenceSink, type Logger,
} from './runtime.ts';
export {
  putAttr, addAttr, mergeAttr, dropAttr, dropIf, updateAttr,
  bulkLoadAttr,
  addRelation, updateRelation,
  getAllEntities,
  queryEntitiesByAttribute, queryEntitiesByRelationTo, queryEntitiesInRelationTo,
  queryEntitiesByRole,
  clearMemory,
} from './attribute-storage.ts';
export { edgeStore } from './edge-store.ts';
export { relationIndex, addToIndex, removeFromIndex, updateIndex, clearRelationIndex } from './relation-index.ts';
export { filterSystemFields } from './helpers.ts';
export { _flushEarlyRegistrations } from './repository.ts';
// The repositories SDK services and seeders call, which the built-in pack implements
export type { BuiltinRepositories } from './builtin-repositories.ts';
// Untyped query helpers for host code; packs get them typed from defineEars (see ./typed)
export { qx } from './query.ts';
export { createEntity } from './attribute-storage.ts';
export {
  findById, findByIdRaw, findAll, findWhere, findFirst,
  findWithFields, findByIdWithFields, findWithRole, findFirstWithRole,
} from './query-helpers.ts';
export { getAttr, getAttrs } from './attribute-storage.ts';
export { createEntityWithDefaults, updateEntity } from './transaction-helpers.ts';
