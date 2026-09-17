/**
 * The Database console's code runners. Console code is the body of a function that returns its result; a query
 * sees the read helpers, a transaction the read and write helpers, all acting on the installed engine. The
 * Database plugin runs its console's code with them, and `abuddy db query`/`exec` run theirs, so the same code
 * means the same thing in both.
 *
 * @packageDocumentation
 */
import {
  defineEars, untypedQx, tx, destroyEntity, getAll, getRoles, grantRole, revokeRole, prepareEntity,
  createRelation, removeRelation, removeRelationById, getAllEntities, getEntitiesOfType, getAllEntityTypes,
  getAllAttributeKinds, getAllRelationKinds, getAttributeStats, getRelationStats, findRelations,
  queryEntitiesByAttribute, queryEntitiesByRelationTo, queryEntitiesInRelationTo, type EARS,
} from '@abuddy/ears';

/** Entities per type, and each attribute kind's and relation kind's use, over the whole database */
export interface SchemaStats {
  entities: Record<string, number>;
  attributes: Record<string, { entityCount: number; totalValues: number }>;
  relations: Record<string, { totalRelations: number; uniqueSources: number; uniqueTargets: number }>;
}

/** The installed engine's data, counted per entity type, attribute kind and relation kind */
export function getSchemaStats(): SchemaStats {
  const stats: SchemaStats = { entities: {}, attributes: {}, relations: {} };
  for (const entityType of getAllEntityTypes()) {
    stats.entities[entityType] = getEntitiesOfType(entityType).length;
  }
  for (const kind of getAllAttributeKinds()) {
    stats.attributes[String(kind)] = getAttributeStats(kind);
  }
  for (const kind of getAllRelationKinds()) {
    const { total, uniqueSources, uniqueTargets } = getRelationStats(kind as EARS.RelKind);
    stats.relations[kind] = { totalRelations: total, uniqueSources, uniqueTargets };
  }
  return stats;
}

const { getAttr, getAttrs, createEntityWithDefaults, updateEntity } = /*#__PURE__*/ defineEars();

const readHelpers = {
  qx: untypedQx,
  getAllEntities,
  getAll,
  queryEntitiesByRelationTo,
  getAttr,
  getAttrs,
  getRoles,
  getEntitiesOfType,
  queryEntitiesByAttribute,
  queryEntitiesInRelationTo,
  findRelations,
  getRelationStats,
  getSchemaStats,
};

const writeHelpers = {
  tx,
  destroyEntity,
  prepareEntity,
  createEntityWithDefaults,
  updateEntity,
  createRelation,
  removeRelation,
  removeRelationById,
  grantRole,
  revokeRole,
};

/** The helpers only a transaction sees: a query naming one fails with "<name> is not defined" */
export const WRITE_HELPER_NAMES: readonly string[] = Object.keys(writeHelpers);

/**
 * The names console code sees besides the helpers: `EARS`, the entity types and relation kinds of the data it
 * runs on (a pack's generated `EARS`, or one built from the installed packs' manifests)
 */
export interface ConsoleScope {
  EARS: object;
}

function run(code: string, scope: ConsoleScope, helpers: Record<string, unknown>): Promise<unknown> {
  if (!code || typeof code !== 'string') throw new Error('No code to run');
  const names = ['EARS', ...Object.keys(helpers)];
  const body = new Function(...names, code);
  return Promise.resolve(body(scope.EARS, ...Object.values(helpers)));
}

/** Runs query code with the read helpers; its error's message is the code's */
export async function runQueryCode(code: string, scope: ConsoleScope): Promise<unknown> {
  try {
    return await run(code, scope, readHelpers);
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : String(error));
  }
}

/** Runs transaction code with the read and write helpers; its error's message starts "Transaction failed:" */
export async function runTransactionCode(code: string, scope: ConsoleScope): Promise<unknown> {
  try {
    return await run(code, scope, { ...readHelpers, ...writeHelpers });
  } catch (error) {
    throw new Error(`Transaction failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
