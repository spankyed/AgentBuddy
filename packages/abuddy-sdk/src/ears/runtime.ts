/**
 * EARS runtime delegates.
 *
 * These are singleton functions initialized by the host (api) at boot.
 * Features import these from @abuddy/sdk/ears and they delegate
 * to the real LMDB-backed implementation.
 */
import type { EARS, EntityShapeRegistry } from '../types/entities';

type AnyFn = (...args: any[]) => any;

let _qx: AnyFn | null = null;
let _tx: AnyFn | null = null;
let _createEntity: AnyFn | null = null;

export interface EARSRuntimeDeps {
  qx: AnyFn;
  tx: AnyFn;
  createEntity: AnyFn;
}

export function initEARSRuntime(deps: EARSRuntimeDeps) {
  _qx = deps.qx;
  _tx = deps.tx;
  _createEntity = deps.createEntity;
}

function ensureInit(name: string, fn: AnyFn | null): AnyFn {
  if (!fn) throw new Error(`EARS runtime not initialized. Call initEARSRuntime() before using ${name}().`);
  return fn;
}

// ─── QueryBuilder fluent interface ──────────────────────────────────────

export interface QueryBuilder<E extends string = string> {
  ofType<T extends string>(t: T): QueryBuilder<T>;
  inIds(sub: readonly EARS.EntityId[]): QueryBuilder<E>;
  where(k: string, v?: unknown): QueryBuilder<E>;
  withRole(r: string): QueryBuilder<E>;
  relatedTo(target: EARS.EntityId): QueryBuilder<E>;
  related(kind: string, other: EARS.EntityId, asSrc?: boolean): QueryBuilder<E>;
  linksTo(relKinds: string | readonly string[], tgtType?: EARS.Entity | EARS.Entity[], asSrc?: boolean): QueryBuilder<E>;
  links<K extends string>(relKinds: K | readonly K[], tgtType?: EARS.Entity | EARS.Entity[], asSrc?: boolean): Array<{ relation: K; id: EARS.EntityId }>;
  edgeIds(kinds?: string | readonly string[], asSrc?: boolean): EARS.EntityId[];
  pick<A extends readonly string[]>(fields: A): any[];
  pickOne<A extends readonly string[]>(f: A): any;
  pickAll(): any[];
  linksPick<K extends string, A extends readonly string[]>(relKinds: K | readonly K[], fields: A, tgtType?: EARS.Entity | EARS.Entity[]): any[];
  orderBy(field: string, dir?: 'asc' | 'desc'): QueryBuilder<E>;
  reverse(): QueryBuilder<E>;
  limit(n: number): QueryBuilder<E>;
  page(size: number, cursor?: string | null): { items: EARS.EntityId[]; nextCursor: string | null };
  distinct(field?: string): QueryBuilder<E>;
  groupBy(field: string): Map<unknown, QueryBuilder<E>>;
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

// ─── TransactionBuilder fluent interface ────────────────────────────────

export interface SafeLinkOptions {
  info?: unknown;
  symmetric?: boolean;
  acyclicGroup?: readonly string[];
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

// ─── Logger interface ───────────────────────────────────────────────────

export interface Logger {
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  debug(...args: unknown[]): void;
}

// ─── Runtime delegates ──────────────────────────────────────────────────

export function qx<E extends keyof EntityShapeRegistry & string>(seed: E): QueryBuilder<E>;
export function qx(seed?: EARS.Entity | EARS.EntityId | EARS.EntityId[]): QueryBuilder;
export function qx(seed?: any): QueryBuilder {
  return ensureInit('qx', _qx)(seed);
}

export function tx(typeOrId: EARS.Entity | EARS.EntityId, useProvidedId?: boolean): TransactionBuilder {
  return ensureInit('tx', _tx)(typeOrId, useProvidedId);
}

export function createEntity<E extends keyof EntityShapeRegistry & string>(entityType: E): EARS.EntityId<E>;
export function createEntity(entityType: EARS.Entity): EARS.EntityId;
export function createEntity(entityType: EARS.Entity): EARS.EntityId {
  return ensureInit('createEntity', _createEntity)(entityType);
}
