/**
 * Database DSL type surface for Monaco intellisense.
 * Defines what's available as globals in the database code editor.
 */

export { EARS } from '@abuddy/sdk/types';
export type { BaseEntity } from '@abuddy/ears';

// The database console runs queries with the pack's typed helpers
export { qx, getAttr, getAttrs } from '@/__generated__/ears';

export {
  tx, bp, spawn,
  getEntitiesOfType, getAllEntityTypes, getAll,
  createRelation, removeRelation, removeRelationById, destroyEntity, prepareEntity,
  getAllAttributeKinds, getAttributeStats, getAllRelationKinds,
  getRoles, grantRole, revokeRole,
  getSchemaStats, isEntity,
  descendants, ancestors, rootParent, linkSymmetric,
  topoSort, shortestPath, leaves, lowestCommonAncestor,
  getAllEntities,
  queryEntitiesByAttribute, queryEntitiesByRelationTo, queryEntitiesInRelationTo,
  findRelations, getRelationStats,
  type QueryBuilder, type RelationMatch, type RelationRow, type RelationStats,
} from '@abuddy/ears';
