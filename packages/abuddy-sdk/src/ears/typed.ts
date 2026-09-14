/**
 * EARS query helpers typed against an entity shape map. This is the only pack-facing way
 * to get them: `abuddy generate-entries` writes `#generated/ears` with
 * `defineEars<PackShapes>()` (the pack's entities plus its dependencies'). There is no
 * global registry, so each pack's typing depends only on what it declares.
 */
import type { EARS, EntityNameArg, EntityShapes, ShapeOf } from '../types/entities.ts';
import type { QueryBuilder } from './runtime.ts';
import { qx } from './query.ts';
import { createEntity, getAttr, getAttrs } from './attribute-storage.ts';
import {
  findById, findByIdRaw, findAll, findWhere, findFirst,
  findWithFields, findByIdWithFields, findWithRole, findFirstWithRole,
} from './query-helpers.ts';
import { createEntityWithDefaults, updateEntity, type CreatedEntityFields } from './transaction-helpers.ts';

/** An entity name argument: a declared name, or a name only known at runtime (see EntityNameArg) */
type Name<N extends string, E extends string> = EntityNameArg<N, E>;

export interface TypedQx<S extends EntityShapes, N extends string = string> {
  (): QueryBuilder<string, S, N>;
  <E extends string>(seed: EARS.EntityId<E>): QueryBuilder<E, S, N>;
  <E extends string>(seed: readonly EARS.EntityId<E>[]): QueryBuilder<E, S, N>;
  <E extends string>(seed: Name<N, E>): QueryBuilder<E, S, N>;
  <E extends string>(seed: readonly Name<N, E>[]): QueryBuilder<string, S, N>;
  // Seeds that may be undefined at the call site
  <E extends string>(seed: Name<N, E> | readonly Name<N, E>[] | EARS.EntityId | readonly EARS.EntityId[] | undefined): QueryBuilder<string, S, N>;
}

export interface TypedFindById<S extends EntityShapes> {
  <E extends string>(id: EARS.EntityId<E>): ShapeOf<S, E> | undefined;
  <T>(id: EARS.EntityId): T | undefined;
}

// The `<T>` overloads read rows as an explicit shape. A call without a type argument that fails the
// first overload infers `E` here too, so an undeclared literal is still rejected; passing `T` leaves
// `E` at its default (`string`), which lets a name known only at runtime through.
export interface TypedFindAll<S extends EntityShapes, N extends string = string> {
  <E extends string>(entityType: Name<N, E>): ShapeOf<S, E>[];
  <T, E extends string = string>(entityType: Name<N, E>): T[];
}

export interface TypedFindWhere<S extends EntityShapes, N extends string = string> {
  <E extends string>(entityType: Name<N, E>, field: string, value: unknown): ShapeOf<S, E>[];
  <T, E extends string = string>(entityType: Name<N, E>, field: string, value: unknown): T[];
}

export interface TypedFindFirst<S extends EntityShapes, N extends string = string> {
  <E extends string>(entityType: Name<N, E>, field: string, value: unknown): ShapeOf<S, E> | undefined;
  <T, E extends string = string>(entityType: Name<N, E>, field: string, value: unknown): T | undefined;
}

/** Brands the id with the entity type when `S` declares its shape; other types stay unbranded. */
export type TypedCreateEntity<S extends EntityShapes, N extends string = string> =
  <E extends string>(t: Name<N, E>) => EARS.EntityId<E extends keyof S ? E : string>;

/** A field's value on an entity whose id names its type; `unknown` when the id isn't branded. */
export interface TypedGetAttr<S extends EntityShapes> {
  <E extends string, K extends keyof ShapeOf<S, E> & string>(id: EARS.EntityId<E>, field: K, index?: number): ShapeOf<S, E>[K] | null;
  (id: EARS.EntityId, field: string, index?: number): unknown;
}

/** Every value stored under a field (multi-valued attributes such as roles). */
export interface TypedGetAttrs<S extends EntityShapes> {
  <E extends string, K extends keyof ShapeOf<S, E> & string>(id: EARS.EntityId<E>, field: K): ShapeOf<S, E>[K][];
  (id: EARS.EntityId, field: string): unknown[];
}

export type TypedFindWithFields<S extends EntityShapes, N extends string = string> =
  <E extends string, K extends keyof ShapeOf<S, E> & string>(entityType: Name<N, E>, fields: readonly K[]) => Pick<ShapeOf<S, E>, K>[];

export type TypedFindByIdWithFields<S extends EntityShapes> =
  <E extends string, K extends keyof ShapeOf<S, E> & string>(id: EARS.EntityId<E>, fields: readonly K[]) => Pick<ShapeOf<S, E>, K> | undefined;

export type TypedFindWithRole<S extends EntityShapes, N extends string = string> =
  <E extends string>(entityType: Name<N, E>, role: string) => ShapeOf<S, E>[];

export type TypedFindFirstWithRole<S extends EntityShapes, N extends string = string> =
  <E extends string>(entityType: Name<N, E>, role: string) => ShapeOf<S, E> | undefined;

/** Creates an entity with a short code, label and timestamps filled in. */
export type TypedCreateEntityWithDefaults<S extends EntityShapes, N extends string = string> = <E extends string>(
  entityType: Name<N, E>,
  data: Partial<ShapeOf<S, E>>,
  prefix?: string,
  providedId?: EARS.EntityId,
) => ShapeOf<S, E> & CreatedEntityFields;

/** Writes the given fields (null drops one) and, unless skipped, `updatedAt`. */
export interface TypedUpdateEntity<S extends EntityShapes> {
  <E extends string>(id: EARS.EntityId<E>, updates: { [K in keyof ShapeOf<S, E>]?: ShapeOf<S, E>[K] | null }, skipTimestamp?: boolean): void;
}

export interface TypedEars<S extends EntityShapes, N extends string = string> {
  qx: TypedQx<S, N>;
  findById: TypedFindById<S>;
  findByIdRaw: TypedFindById<S>;
  findAll: TypedFindAll<S, N>;
  findWhere: TypedFindWhere<S, N>;
  findFirst: TypedFindFirst<S, N>;
  findWithFields: TypedFindWithFields<S, N>;
  findByIdWithFields: TypedFindByIdWithFields<S>;
  findWithRole: TypedFindWithRole<S, N>;
  findFirstWithRole: TypedFindFirstWithRole<S, N>;
  createEntity: TypedCreateEntity<S, N>;
  createEntityWithDefaults: TypedCreateEntityWithDefaults<S, N>;
  updateEntity: TypedUpdateEntity<S>;
  getAttr: TypedGetAttr<S>;
  getAttrs: TypedGetAttrs<S>;
}

/**
 * The EARS query helpers typed against `S`, taking the entity names `N` (any string when omitted).
 * Returns the same singleton functions every pack shares; only their types differ.
 */
export function defineEars<S extends EntityShapes, N extends string = string>(): TypedEars<S, N> {
  return {
    qx, findById, findByIdRaw, findAll, findWhere, findFirst,
    findWithFields, findByIdWithFields, findWithRole, findFirstWithRole,
    createEntity, createEntityWithDefaults, updateEntity, getAttr, getAttrs,
  } as unknown as TypedEars<S, N>;
}
