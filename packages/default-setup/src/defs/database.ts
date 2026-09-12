/**
 * DSL Export Module
 * This module exports all types and functions needed for the EARS DSL
 * Used to generate type definitions for Monaco Editor
 */

import { qx } from '@abuddy/sdk/ears';

export { EARS, type BaseEntity } from '@abuddy/sdk/types';

export { qx } from '@abuddy/sdk/ears';

export {
  getEntitiesOfType, getAllEntityTypes, getAttr, getAttrs,
  createRelation, removeRelation, removeRelationById, destroyEntity, prepareEntity,
  getAll, getAllAttributeKinds, getAttributeStats, getAllRelationKinds,
  getRoles, grantRole, revokeRole,
  getSchemaStats, isEntity,
} from '@abuddy/sdk/ears';
export {
  getAllEntities,
  queryEntitiesByAttribute, queryEntitiesByRelationTo, queryEntitiesInRelationTo,
} from '@abuddy/sdk/ears/internals';

export {
  descendants, ancestors, rootParent, linkSymmetric,
  topoSort, shortestPath, leaves, lowestCommonAncestor,
} from '@abuddy/sdk/ears';

export { tx } from '@abuddy/sdk/ears';
export { bp, spawn } from '@abuddy/sdk/ears';

export type QueryBuilder = ReturnType<typeof qx>;
