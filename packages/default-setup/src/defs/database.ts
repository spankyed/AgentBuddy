/**
 * The Database console's type surface for Monaco: exactly the names console code can use, so the editor's types and
 * what the code actually gets are one list. The runners provide them (`@abuddy/sdk/database-console`), and
 * `abuddy.json`'s `dsl.database.globals` names them all (`tests/unit/database-console-globals.test.ts`).
 */

export { EARS } from '@abuddy/sdk/types';
export type { BaseEntity, QueryBuilder, RelationMatch, RelationRow, RelationStats } from '@abuddy/ears';

// Read: the pack's typed helpers where there are any, the engine's otherwise
export { qx, getAttr, getAttrs } from '@/__generated__/ears';
export {
  getAll, getRoles, getAllEntities, getEntitiesOfType,
  queryEntitiesByAttribute, queryEntitiesByRelationTo, queryEntitiesInRelationTo,
  findRelations, getRelationStats,
} from '@abuddy/ears';
export { getSchemaStats } from '@abuddy/sdk/database-console';

// Write: only a transaction gets these; a query naming one fails with "<name> is not defined"
export { createEntityWithDefaults, updateEntity } from '@/__generated__/ears';
export {
  untypedTx as tx, destroyEntity, prepareEntity, createRelation, removeRelation, removeRelationById, grantRole, revokeRole,
} from '@abuddy/ears';
