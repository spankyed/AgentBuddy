/**
 * The Database console's type surface for Monaco: exactly the names console code can use, so the editor's types and
 * what the code actually gets are one list. The runners provide them (`@apack/sdk/database-console`), and
 * `apack.json`'s `dsl.database.globals` names them all (`tests/defs/database-console-globals.spec.ts`).
 */

export { EARS } from '@apack/sdk/types';
export type { BaseEntity, QueryBuilder, RelationMatch, RelationRow, RelationStats } from '@apack/ears';

// Read: the pack's typed helpers where there are any, the engine's otherwise
export { qx, getAttr, getAttrs } from '#generated/ears.ts';
export {
  getAll, getRoles, getAllEntities, getEntitiesOfType,
  queryEntitiesByAttribute, queryEntitiesByRelationTo, queryEntitiesInRelationTo,
  findRelations, getRelationStats,
} from '@apack/ears';
export { getSchemaStats } from '@apack/sdk/database-console';

// Write: only a transaction gets these; a query naming one fails with "<name> is not defined"
export { createEntityWithDefaults, updateEntity } from '#generated/ears.ts';
export {
  untypedTx as tx, destroyEntity, prepareEntity, createRelation, removeRelation, removeRelationById, grantRole, revokeRole,
} from '@apack/ears';
