/**
 * EARS runtime delegates.
 *
 * These are singleton functions initialized by the host (api) at boot.
 * Features import these from @abuddy/sdk/ears and they delegate
 * to the real LMDB-backed implementation.
 */
import type { EARS } from '../types/entities';

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

export interface QueryBuilder {
  ofType(t: EARS.Entity): QueryBuilder;
  inIds(sub: readonly EARS.EntityId[]): QueryBuilder;
  where(k: string, v?: unknown): QueryBuilder;
  withRole(r: string): QueryBuilder;
  relatedTo(target: EARS.EntityId): QueryBuilder;
  related(kind: string, other: EARS.EntityId, asSrc?: boolean): QueryBuilder;
  linksTo(relKinds: string | readonly string[], tgtType?: EARS.Entity | EARS.Entity[], asSrc?: boolean): QueryBuilder;
  links<K extends string>(relKinds: K | readonly K[], tgtType?: EARS.Entity | EARS.Entity[], asSrc?: boolean): Array<{ relation: K; id: EARS.EntityId }>;
  edgeIds(kinds?: string | readonly string[], asSrc?: boolean): EARS.EntityId[];
  pick<A extends readonly string[]>(fields: A): any[];
  pickOne<A extends readonly string[]>(f: A): any;
  pickAll(): any[];
  linksPick<K extends string, A extends readonly string[]>(relKinds: K | readonly K[], fields: A, tgtType?: EARS.Entity | EARS.Entity[]): any[];
  orderBy(field: string, dir?: 'asc' | 'desc'): QueryBuilder;
  reverse(): QueryBuilder;
  limit(n: number): QueryBuilder;
  page(size: number, cursor?: string | null): { items: EARS.EntityId[]; nextCursor: string | null };
  distinct(field?: string): QueryBuilder;
  groupBy(field: string): Map<unknown, QueryBuilder>;
  ids(): EARS.EntityId[];
  id(): EARS.EntityId | null;
  count(): number;
  first(): EARS.EntityId | null;
  last(): EARS.EntityId | null;
  exists(): boolean;
  map<T>(fn: (id: EARS.EntityId) => T): T[];
  forEach(fn: (id: EARS.EntityId) => void): QueryBuilder;
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
  verbose(...args: unknown[]): void;
}

// ─── Runtime delegates ──────────────────────────────────────────────────

export function qx(seed?: EARS.Entity | EARS.EntityId | EARS.EntityId[]): QueryBuilder {
  return ensureInit('qx', _qx)(seed);
}

export function tx(typeOrId: EARS.Entity | EARS.EntityId, useProvidedId?: boolean): TransactionBuilder {
  return ensureInit('tx', _tx)(typeOrId, useProvidedId);
}

export function createEntity(entityType: EARS.Entity): EARS.EntityId {
  return ensureInit('createEntity', _createEntity)(entityType);
}
