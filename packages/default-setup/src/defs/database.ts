/**
 * DSL Export Module
 * This module exports all types and functions needed for the EARS DSL
 * Used to generate type definitions for Monaco Editor
 */

import { EARS } from '@abuddy/sdk/types';
export { EARS, type BaseEntity } from '@abuddy/sdk/types';

import { qx } from '@abuddy/sdk/ears';
export { qx } from '@abuddy/sdk/ears';

import {
  getEntitiesOfType, getAllEntityTypes, getAllAttributeKinds,
  getAttributeStats, getAllRelationKinds,
} from '@abuddy/sdk/ears';

export {
  getEntitiesOfType, getAllEntityTypes, getAttr, getAttrs,
  createRelation, removeRelation, removeRelationById, destroyEntity, prepareEntity,
  getAll, getAllAttributeKinds, getAttributeStats, getAllRelationKinds,
  getRoles, grantRole, revokeRole,
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

export function getSchemaStats() {
  return {
    entities: getAllEntityTypes().reduce((acc: Record<string, number>, type: string) => {
      acc[type] = getEntitiesOfType(type as EARS.Entity).length;
      return acc;
    }, {}),
    attributes: getAllAttributeKinds().reduce((acc: Record<string, number>, kind: EARS.AttrKind) => {
      acc[kind as string] = getAttributeStats(kind).totalValues;
      return acc;
    }, {}),
    relations: getAllRelationKinds().reduce((acc: Record<string, number>, kind: string) => {
      acc[kind] = 0;
      return acc;
    }, {}),
  };
}

export function isEntity(value: unknown): value is EARS.Entity {
  return (Object.values(EARS.Entity) as string[]).includes(value as string);
}

export type QueryBuilder = ReturnType<typeof qx>;
export type EntityId = EARS.EntityId;
export type Entity = EARS.Entity;
export type RelKind = EARS.RelKind;
export type AttrKind = EARS.AttrKind;
