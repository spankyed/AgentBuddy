/**
 * The app's engine, and the engine operations pack code calls without holding one. `@apackdev/ears` keeps no
 * engine of its own: an operation there is a member of the engine you hold (`engine.create(...)`). Here, the
 * engine is the one this process bound — the app's (`bindHost`), a test's (`startTestRuntime`) or a tool's
 * (`_bindEars`) — and each function acts on it, throwing naming how to bind one when none is.
 *
 * A pack's typed operations are its `#generated/ears`, which binds `defineEars` to `boundEars`. The `untyped*`
 * functions here are their unchecked twins; the rest have no typed form.
 *
 * @packageDocumentation
 */
import type { Create, EarsQuery, Qx, Upsert, Write } from '@apackdev/ears';

let bound: EarsQuery | undefined;

/** The error an engine use with none bound throws */
export const NO_ENGINE_BOUND =
  'No EARS engine is bound: the app binds its engine when it starts (bindHost from @apackdev/sdk/runtime), ' +
  'unit tests with startTestRuntime() from @apackdev/sdk/testing, and tooling with _bindEars(engine)';

/**
 * Makes `engine` the one this process's engine operations act on, or none with `undefined`; returns the one it
 * replaced, so a tool can put it back. Host-only: the app binds its engine through `bindHost`.
 *
 * @internal
 */
export function _bindEars(engine: EarsQuery | undefined): EarsQuery | undefined {
  const previous = bound;
  bound = engine;
  return previous;
}

/** The engine this process bound; throws when none is */
export function boundEars(): EarsQuery {
  if (!bound) throw new Error(NO_ENGINE_BOUND);
  return bound;
}

/** `name` on the bound engine, typed as the engine's member */
const onBound = <K extends keyof EarsQuery>(name: K) =>
  ((...args: unknown[]) => (boundEars()[name] as (...a: unknown[]) => unknown)(...args)) as unknown as EarsQuery[K];

/** The unchecked query entry points on the bound engine: `qx(type)`, `qx.ids(ids)`, `qx.all()` */
export const untypedQx: Qx = Object.assign(
  ((start: unknown) => boundEars().qx(start as never)) as unknown as Qx,
  {
    ids: ((ids) => boundEars().qx.ids(ids)) as Qx['ids'],
    all: (() => boundEars().qx.all()) as Qx['all'],
  },
);
/** `create` on the bound engine, unchecked against any pack's shapes */
export const untypedCreate: Create = onBound('create');
/** `upsert` on the bound engine, unchecked against any pack's shapes */
export const untypedUpsert: Upsert = onBound('upsert');
/** `write` on the bound engine, unchecked against any pack's shapes */
export const untypedWrite: Write = onBound('write');

export const transact = onBound('transact');
export const isEntityType = onBound('isEntityType');
export const updateRelation = onBound('updateRelation');
export const removeRelationById = onBound('removeRelationById');
export const createRelation = onBound('createRelation');
export const removeRelation = onBound('removeRelation');
export const findRelations = onBound('findRelations');
export const getRelationStats = onBound('getRelationStats');
export const destroyEntity = onBound('destroyEntity');
export const getAll = onBound('getAll');
export const getRoles = onBound('getRoles');
export const grantRole = onBound('grantRole');
export const revokeRole = onBound('revokeRole');
export const exists = onBound('exists');
export const countEntities = onBound('countEntities');
export const hasIdCollision = onBound('hasIdCollision');
export const getAllEntities = onBound('getAllEntities');
export const getEntitiesOfType = onBound('getEntitiesOfType');
export const getAllEntityTypes = onBound('getAllEntityTypes');
export const getAllAttributeKinds = onBound('getAllAttributeKinds');
export const getAllRelationKinds = onBound('getAllRelationKinds');
export const getAttributeStats = onBound('getAttributeStats');
export const getSchemaStats = onBound('getSchemaStats');
export const queryEntitiesByAttribute = onBound('queryEntitiesByAttribute');
export const queryEntitiesByRelationTo = onBound('queryEntitiesByRelationTo');
export const queryEntitiesInRelationTo = onBound('queryEntitiesInRelationTo');
export const generateShortCode = onBound('generateShortCode');
export const generateLabelWithCount = onBound('generateLabelWithCount');
export const spawn = onBound('spawn');
export const descendants = onBound('descendants');
export const ancestors = onBound('ancestors');
export const rootParent = onBound('rootParent');
export const linkSymmetric = onBound('linkSymmetric');
export const wouldCreateCycle = onBound('wouldCreateCycle');
export const topoSort = onBound('topoSort');
export const shortestPath = onBound('shortestPath');
export const leaves = onBound('leaves');
export const lowestCommonAncestor = onBound('lowestCommonAncestor');
export const registerRepository = onBound('registerRepository');
export const unregisterRepository = onBound('unregisterRepository');

/** The bound engine's registered repositories; reading one that isn't registered throws */
export const repository: Record<string, unknown> = new Proxy({}, {
  get: (_target, name) => (typeof name === 'string' ? boundEars().repository[name] : undefined),
});
