export type {
  EARSRuntimeDeps, QueryBuilder, TransactionBuilder, SafeLinkOptions, FieldValue, FieldValues,
} from './runtime.ts';
export { isEntityType } from './runtime.ts';
export { b64Encode, b64Decode, type QxSeed } from './query.ts';
export { tx } from './transaction.ts';
export {
  getEntitiesOfType, getAllEntityTypes, destroyEntity, removeRelationById,
  getAll, getAllAttributeKinds, getAllRelationKinds, getAttributeStats, getSchemaStats, isEntity,
  getRoles, grantRole, revokeRole,
} from './attribute-storage.ts';
export {
  repository, registerRepository, type Repository,
  hasIdCollision,
  exists,
  repoCreateRelation as createRelation,
  repoRemoveRelation as removeRelation,
  countEntities,
  RepositoryError, RepositoryErrorCode,
  prepareEntity,
} from './repository.ts';
export {
  wouldCreateCycle, getTimestamp, generateShortCode, generateLabelWithCount, filterSystemFields,
} from './helpers.ts';
export { findRelations, getRelationStats, type RelationMatch, type RelationRow, type RelationStats } from './relations.ts';
export { getAllEntities, queryEntitiesByAttribute, queryEntitiesByRelationTo, queryEntitiesInRelationTo } from './attribute-storage.ts';
/**
 * The untyped query: entity names and fields aren't checked. Pack code queries with the typed `qx`
 * from #generated/ears; this is the escape hatch for fields only known at runtime or that vary across
 * a union shape's members (TYPED-EARS.md).
 */
export { qx as untypedQx } from './query.ts';
// Types that appear in the signatures above, so pack authors can name them.
export type { CreatedEntityFields } from './transaction-helpers.ts';
export type { PersistenceSink } from './runtime.ts';
export { EARS } from '../types/entities.ts';
export type { EntityShapes, ShapeOf, EntityNameArg, BaseEntity } from '../types/entities.ts';
export {
  defineEars,
  type TypedEars, type TypedQx, type TypedTx, type TypedFindById, type TypedFindAll, type TypedFindWhere, type TypedFindFirst, type TypedCreateEntity,
  type TypedGetAttr, type TypedGetAttrs, type TypedFindWithFields, type TypedFindByIdWithFields, type TypedFindWithRole,
  type TypedFindFirstWithRole, type TypedCreateEntityWithDefaults, type TypedUpdateEntity,
} from './typed.ts';
export { bp, spawn, type Blueprint, type BlueprintBuilder } from './blueprint.ts';
export {
  descendants, ancestors, rootParent, linkSymmetric,
  topoSort, shortestPath, leaves, lowestCommonAncestor,
} from './graph.ts';
