/**
 * The Database console's code runners. Console code is the body of a function that returns its result; a query
 * sees the read helpers, a transaction the read and write helpers, all acting on the installed engine. The
 * Database surface runs its console's code with them, and `apack db query`/`exec` run theirs, so the same code
 * means the same thing in both.
 *
 * @packageDocumentation
 */
import { boundHost } from '../runtime/host-runtime.ts';
import type { EarsNames } from '../runtime/packs-view.ts';
import { EARS as EARS_NAMES } from '../types/index.ts';
import {
  defineEars, untypedQx, untypedCreate, untypedUpsert, untypedWrite, destroyEntity, getAll, getRoles, grantRole, revokeRole, prepareEntity,
  createRelation, removeRelation, removeRelationById, getAllEntities, getEntitiesOfType, getAllEntityTypes,
  getAllAttributeKinds, getAllRelationKinds, getAttributeStats, getRelationStats, findRelations,
  queryEntitiesByAttribute, queryEntitiesByRelationTo, queryEntitiesInRelationTo, type EARS,
} from '@apackdev/ears';
import { errorMessage } from '../utils/shared.ts';

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
  create: untypedCreate,
  upsert: untypedUpsert,
  write: untypedWrite,
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

/**
 * What query code sees besides `EARS`. Nothing here may write: a `query` flow step's safety rests on it (the step
 * refuses a generated query that names a write helper, which is undefined for a query).
 */
export const READ_HELPER_NAMES: readonly string[] = Object.keys(readHelpers);

/** The helpers only a transaction sees: a query naming one fails with "<name> is not defined" */
export const WRITE_HELPER_NAMES: readonly string[] = Object.keys(writeHelpers);

/**
 * The names console code sees besides the helpers: `EARS`, the entity types and relation kinds of the data it
 * runs on (a pack's generated `EARS`, or one built from the installed packs' manifests)
 */
export interface ConsoleScope {
  EARS: object;
}

/**
 * A name the database cannot account for is an error, not a number.
 *
 * `EARS.Entity.Note` for a name nothing declares used to read `undefined`, and `qx(undefined)` means *every*
 * entity — so a query for one type answered with the whole database, measured as 607 rows where 2 were asked
 * for. That is a wrong answer rather than a failure, which is why it has to be refused here: `qx('Note')` for
 * an unknown name is harmless (it finds nothing), and `qx()` with no start is a declared, documented overload
 * that eight callers and this console's own examples use. The namespace is the only layer that can tell the
 * two apart, because it is the only one that knows the name was asked for.
 *
 * It is a `Proxy` rather than a getter per name because the names are data: what is declared comes from the
 * installed packs. The traps are what legitimate code does with the object — `db script` is handed it raw
 * (`apack-cli/src/commands/db/script.ts`), so enumerating, spreading and `JSON.stringify` all have to work,
 * and a symbol or a `then`/`toJSON` probe has to read as absent rather than throw, or awaiting a result that
 * carries one would.
 */
function accountedFor<T extends object>(what: string, names: T, hint?: string): T {
  return new Proxy(names, {
    get(target, property, receiver) {
      if (typeof property === 'symbol' || property in target) return Reflect.get(target, property, receiver);
      // A probe, not a name: `await`, `JSON.stringify` and a console's inspection all ask for these by name
      if (property === 'then' || property === 'toJSON' || property === 'inspect' || property === 'constructor') return undefined;
      throw new Error(
        `"${property}" is not ${what} this database can account for.\n`
        + `  Known: ${Object.keys(target).sort().join(', ')}`
        + (hint === undefined ? '' : `\n  ${hint}`),
      );
    },
    // Asking whether a name is there is a question, not a use of it, so it answers rather than throwing
    has: (target, property) => property in target,
  });
}

/**
 * `EARS` for console code: the SDK's, with the entity types and relation kinds `names` declares. Console code
 * queries the whole database, so it names every installed pack's types, not only the pack running the console.
 *
 * `hint` is how a caller says what would supply the missing names — the CLI's `--schema-from`, for a data dir
 * whose rows outlived their pack. The app's console has no such answer and passes none, which is why this is
 * the caller's sentence and not a string written here.
 */
export function consoleEars(names: EarsNames, { hint }: { hint?: string } = {}): ConsoleScope['EARS'] {
  return {
    ...EARS_NAMES,
    Entity: accountedFor('an entity type', { ...EARS_NAMES.Entity, ...names.entities }, hint),
    RelKind: accountedFor('a relation kind', { ...EARS_NAMES.RelKind, ...names.relKinds }, hint),
  };
}

/** `EARS` for console code in a running app: every registered pack's, from the app's registry */
export function installedEars(): ConsoleScope['EARS'] {
  return consoleEars(boundHost().packs.earsNames());
}

function run(code: string, scope: ConsoleScope, helpers: Record<string, unknown>): Promise<unknown> {
  // Blank code is nothing to run, not code that returns nothing: whitespace alone would otherwise build a function
  // body and answer `undefined`, which reads as a query that found nothing
  if (typeof code !== 'string' || code.trim() === '') throw new Error('No code to run');
  const names = ['EARS', ...Object.keys(helpers)];
  const body = new Function(...names, code);
  return Promise.resolve(body(scope.EARS, ...Object.values(helpers)));
}

/** Runs query code with the read helpers; its error's message is the code's */
export async function runQueryCode(code: string, scope: ConsoleScope): Promise<unknown> {
  try {
    return await run(code, scope, readHelpers);
  } catch (error) {
    throw new Error(errorMessage(error));
  }
}

/**
 * Runs transaction code with the read and write helpers; its error's message starts "Transaction failed:". The
 * writes are not one transaction: each helper writes as the code runs, so what ran before a failure stands, which
 * the message says.
 */
export async function runTransactionCode(code: string, scope: ConsoleScope): Promise<unknown> {
  try {
    return await run(code, scope, { ...readHelpers, ...writeHelpers });
  } catch (error) {
    const reason = errorMessage(error);
    throw new Error(`Transaction failed: ${reason}\n  The writes it made before failing stand: nothing is rolled back.`);
  }
}
