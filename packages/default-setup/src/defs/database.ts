/**
 * Database DSL type surface for Monaco intellisense.
 * Defines what's available as globals in the database code editor.
 */

export { EARS, type BaseEntity } from '@abuddy/sdk/types';

export {
  qx, tx, bp, spawn,
  getEntitiesOfType, getAllEntityTypes, getAttr, getAttrs, getAll,
  createRelation, removeRelation, removeRelationById, destroyEntity, prepareEntity,
  getAllAttributeKinds, getAttributeStats, getAllRelationKinds,
  getRoles, grantRole, revokeRole,
  getSchemaStats, isEntity,
  descendants, ancestors, rootParent, linkSymmetric,
  topoSort, shortestPath, leaves, lowestCommonAncestor,
  type QueryBuilder,
} from '@abuddy/sdk/ears';

export {
  getAllEntities,
  queryEntitiesByAttribute, queryEntitiesByRelationTo, queryEntitiesInRelationTo,
} from '@abuddy/sdk/ears/internals';
