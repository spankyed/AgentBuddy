/**
 * EARS runtime configuration and type definitions.
 *
 * Holds injectable state (persistence sink, entity type checker) that the
 * host (api) provides at boot via initEARSRuntime(). The in-memory engine
 * and helpers import getters from here to access host-provided services.
 */
import type { EARS, EntityShape } from '../types/entities';

// ─── PersistenceSink interface ─────────────────────────────────────────

export interface PersistenceSink {
  onCreateEntity(entityId: string, entityType?: string): void;
  onDestroyEntity(entityId: string): void;
  onPutAttr(kind: string, entityId: string, idx: number, value: unknown, entireArray?: unknown[]): void;
  onDropAttr(kind: string, entityId: string, idx: number, entireArray?: unknown[]): void;
  onPutAttrArray?(kind: string, entityId: string, values: unknown[]): void;
  onAddRelation(relId: string, kind: string, src: string, tgt: string, info: unknown): void;
  onUpdateRelation(relId: string, patch: { src?: string; tgt?: string; info?: unknown }): void;
  onRemoveRelation(relId: string): void;
  close?(): void;
  getErrorStats?(): { errorCount: number; lastError: any };
}

const noopSink: PersistenceSink = {
  onCreateEntity() {},
  onDestroyEntity() {},
  onPutAttr() {},
  onDropAttr() {},
  onAddRelation() {},
  onUpdateRelation() {},
  onRemoveRelation() {},
};

// ─── Injectable state ──────────────────────────────────────────────────

let _persistence: PersistenceSink = noopSink;
let _isEntityType: (v: string) => boolean = () => false;

export interface EARSRuntimeDeps {
  persistence?: PersistenceSink;
  isEntityType: (v: string) => boolean;
}

export function initEARSRuntime(deps: EARSRuntimeDeps) {
  _isEntityType = deps.isEntityType;
  if (deps.persistence) _persistence = deps.persistence;
}

export function getPersistence(): PersistenceSink { return _persistence; }
export function setPersistence(sink: PersistenceSink) { _persistence = sink; }
export function getEntityTypeChecker(): (v: string) => boolean { return _isEntityType; }

// ─── QueryBuilder fluent interface ─────────────────────────────────────

export interface QueryBuilder<E extends string = string> {
  ofType<T extends string>(t: T): QueryBuilder<T>;
  inIds(sub: readonly EARS.EntityId[]): QueryBuilder<E>;
  where<K extends keyof EntityShape<E> & string>(k: K, v?: EntityShape<E>[K]): QueryBuilder<E>;
  withRole(r: string): QueryBuilder<E>;
  relatedTo(target: EARS.EntityId): QueryBuilder<E>;
  related(kind: string, other: EARS.EntityId, asSrc?: boolean): QueryBuilder<E>;
  /**
   * Navigates to the entities related to the current set — unlike `relatedTo`
   * and `related`, which filter it. The result therefore holds `tgtType`
   * entities, not `E`; with `tgtType` omitted the target is unknown.
   */
  linksTo<T extends EARS.Entity>(
    relKinds: string | readonly string[],
    tgtType: T | readonly T[],
    asSrc?: boolean,
  ): QueryBuilder<T>;
  // Target absent or not statically known — the resulting entity type is unknown.
  linksTo(
    relKinds: string | readonly string[],
    tgtType?: EARS.Entity | readonly EARS.Entity[],
    asSrc?: boolean,
  ): QueryBuilder<string>;
  links<K extends string>(relKinds: K | readonly K[], tgtType?: EARS.Entity | EARS.Entity[], asSrc?: boolean): Array<{ relation: K; id: EARS.EntityId }>;
  edgeIds(kinds?: string | readonly string[], asSrc?: boolean): EARS.EntityId[];
  pick<A extends readonly (keyof EntityShape<E> & string)[]>(
    fields: A,
  ): ({ id: EARS.EntityId } & Pick<EntityShape<E>, A[number]>)[];
  pickOne<A extends readonly (keyof EntityShape<E> & string)[]>(
    f: A,
  ): ({ id: EARS.EntityId } & Pick<EntityShape<E>, A[number]>) | null;
  pickAll(): EntityShape<E>[];
  /**
   * Fields here describe the relation's TARGET entity, not `E`, so they are
   * checked against `tgtType`. With `tgtType` omitted the target is unknown and
   * the field list is unconstrained.
   *
   * Two overloads because the implementation only tags rows with `relation`
   * when more than one relation kind is requested.
   */
  linksPick<K extends string, T extends EARS.Entity, A extends readonly (keyof EntityShape<T> & string)[]>(
    relKinds: readonly [K, K, ...K[]],
    fields: A,
    tgtType?: T | T[],
  ): ({ id: EARS.EntityId; relation: K } & Pick<EntityShape<T>, A[number]>)[];
  linksPick<K extends string, T extends EARS.Entity, A extends readonly (keyof EntityShape<T> & string)[]>(
    relKinds: K | readonly [K],
    fields: A,
    tgtType?: T | T[],
  ): ({ id: EARS.EntityId } & Pick<EntityShape<T>, A[number]>)[];
  orderBy(field: keyof EntityShape<E> & string, dir?: 'asc' | 'desc'): QueryBuilder<E>;
  reverse(): QueryBuilder<E>;
  limit(n: number): QueryBuilder<E>;
  page(size: number, cursor?: string | null): { items: EARS.EntityId[]; nextCursor: string | null };
  distinct(field?: keyof EntityShape<E> & string): QueryBuilder<E>;
  groupBy(field: keyof EntityShape<E> & string): Map<unknown, QueryBuilder<E>>;
  ids(): EARS.EntityId[];
  id(): EARS.EntityId | null;
  count(): number;
  first(): EARS.EntityId | null;
  last(): EARS.EntityId | null;
  exists(): boolean;
  map<T>(fn: (id: EARS.EntityId) => T): T[];
  forEach(fn: (id: EARS.EntityId) => void): QueryBuilder<E>;
  reduce<T>(fn: (acc: T, id: EARS.EntityId) => T, init: T): T;
}

// ─── TransactionBuilder fluent interface ───────────────────────────────

export interface SafeLinkOptions {
  info?: unknown;
  symmetric?: boolean;
  acyclicGroup?: readonly EARS.RelKind[];
}

export interface TransactionBuilder {
  put(k: string, v: unknown, allowMultiple?: boolean): TransactionBuilder;
  add(k: string, v: unknown): TransactionBuilder;
  batchPut(attrs: Record<string, unknown>): TransactionBuilder;
  merge(k: string, v: unknown, i?: number): TransactionBuilder;
  drop(k: string, i?: number): TransactionBuilder;
  dropIf(k: string, c: unknown): TransactionBuilder;
  update(k: string, v: unknown): TransactionBuilder;
  updateBatch(attrs: Record<string, unknown>): TransactionBuilder;
  grant(r: string): TransactionBuilder;
  revoke(r: string): TransactionBuilder;
  ensure(r: string, scope?: readonly EARS.EntityId[]): TransactionBuilder;
  link(k: string, t: EARS.EntityId, info?: unknown): TransactionBuilder;
  relPatch(rel: EARS.EntityId, u: { sourceEntity?: EARS.EntityId; targetEntity?: EARS.EntityId; info?: unknown }): TransactionBuilder;
  unlink(rel: EARS.EntityId): TransactionBuilder;
  linkOne(k: string, t: EARS.EntityId, info?: unknown): TransactionBuilder;
  safeLink(k: string, t: EARS.EntityId, options?: SafeLinkOptions): TransactionBuilder;
  patchLink(k: string, t: EARS.EntityId, u: { newTarget: EARS.EntityId; newInfo?: unknown }): TransactionBuilder;
  unlinkIf(k: string, t?: EARS.EntityId): TransactionBuilder;
  unlinkWhere(c?: { kind?: string; target?: EARS.EntityId }): TransactionBuilder;
  define(def: { attributes?: Record<string, unknown>; links?: [string, EARS.EntityId] | Array<[string, EARS.EntityId]>; roles?: string | string[] }): TransactionBuilder;
  destroy(skipPersistence?: boolean): never;
  id(): EARS.EntityId;
}

// ─── Logger interface ──────────────────────────────────────────────────

export interface Logger {
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  debug(...args: unknown[]): void;
}
