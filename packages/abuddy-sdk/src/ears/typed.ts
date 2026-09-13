/**
 * EARS query helpers typed against an entity shape map. This is the only pack-facing way
 * to get them: `abuddy generate-entries` writes `#generated/ears` with
 * `defineEars<PackShapes>()` (the pack's entities plus its dependencies'). There is no
 * global registry, so each pack's typing depends only on what it declares.
 */
import type { EARS, EntityShapes, ShapeOf } from '../types/entities.ts';
import type { QueryBuilder } from './runtime.ts';
import { qx, type QxSeed } from './query.ts';
import { createEntity, getAttr, getAttrs } from './attribute-storage.ts';
import {
  findById, findByIdRaw, findAll, findWhere, findFirst,
  findWithFields, findByIdWithFields, findWithRole, findFirstWithRole,
} from './query-helpers.ts';
import { createEntityWithDefaults, updateEntity, type CreatedEntityFields } from './transaction-helpers.ts';

export interface TypedQx<S extends EntityShapes> {
  (): QueryBuilder<string, S>;
  <E extends string>(seed: EARS.EntityId<E>): QueryBuilder<E, S>;
  <E extends string>(seed: readonly EARS.EntityId<E>[]): QueryBuilder<E, S>;
  <E extends EARS.Entity>(seed: E): QueryBuilder<E, S>;
  (seed: readonly EARS.Entity[]): QueryBuilder<string, S>;
  (seed?: QxSeed): QueryBuilder<string, S>;
}

export interface TypedFindById<S extends EntityShapes> {
  <E extends string>(id: EARS.EntityId<E>): ShapeOf<S, E> | undefined;
  <T>(id: EARS.EntityId): T | undefined;
}

export interface TypedFindAll<S extends EntityShapes> {
  <E extends EARS.Entity>(entityType: E): ShapeOf<S, E>[];
  <T>(entityType: EARS.Entity): T[];
}

export interface TypedFindWhere<S extends EntityShapes> {
  <E extends EARS.Entity>(entityType: E, field: string, value: unknown): ShapeOf<S, E>[];
  <T>(entityType: EARS.Entity, field: string, value: unknown): T[];
}

export interface TypedFindFirst<S extends EntityShapes> {
  <E extends EARS.Entity>(entityType: E, field: string, value: unknown): ShapeOf<S, E> | undefined;
  <T>(entityType: EARS.Entity, field: string, value: unknown): T | undefined;
}

/** Brands the id with the entity type when `S` declares its shape; other types stay unbranded. */
export type TypedCreateEntity<S extends EntityShapes> =
  <E extends EARS.Entity>(t: E) => EARS.EntityId<E extends keyof S ? E : string>;

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

export type TypedFindWithFields<S extends EntityShapes> =
  <E extends EARS.Entity, K extends keyof ShapeOf<S, E> & string>(entityType: E, fields: readonly K[]) => Pick<ShapeOf<S, E>, K>[];

export type TypedFindByIdWithFields<S extends EntityShapes> =
  <E extends string, K extends keyof ShapeOf<S, E> & string>(id: EARS.EntityId<E>, fields: readonly K[]) => Pick<ShapeOf<S, E>, K> | undefined;

export type TypedFindWithRole<S extends EntityShapes> =
  <E extends EARS.Entity>(entityType: E, role: string) => ShapeOf<S, E>[];

export type TypedFindFirstWithRole<S extends EntityShapes> =
  <E extends EARS.Entity>(entityType: E, role: string) => ShapeOf<S, E> | undefined;

/** Creates an entity with a short code, label and timestamps filled in. */
export type TypedCreateEntityWithDefaults<S extends EntityShapes> = <E extends EARS.Entity>(
  entityType: E,
  data: Partial<ShapeOf<S, E>>,
  prefix?: string,
  providedId?: EARS.EntityId,
) => ShapeOf<S, E> & CreatedEntityFields;

/** Writes the given fields (null drops one) and, unless skipped, `updatedAt`. */
export interface TypedUpdateEntity<S extends EntityShapes> {
  <E extends string>(id: EARS.EntityId<E>, updates: { [K in keyof ShapeOf<S, E>]?: ShapeOf<S, E>[K] | null }, skipTimestamp?: boolean): void;
}

export interface TypedEars<S extends EntityShapes> {
  qx: TypedQx<S>;
  findById: TypedFindById<S>;
  findByIdRaw: TypedFindById<S>;
  findAll: TypedFindAll<S>;
  findWhere: TypedFindWhere<S>;
  findFirst: TypedFindFirst<S>;
  findWithFields: TypedFindWithFields<S>;
  findByIdWithFields: TypedFindByIdWithFields<S>;
  findWithRole: TypedFindWithRole<S>;
  findFirstWithRole: TypedFindFirstWithRole<S>;
  createEntity: TypedCreateEntity<S>;
  createEntityWithDefaults: TypedCreateEntityWithDefaults<S>;
  updateEntity: TypedUpdateEntity<S>;
  getAttr: TypedGetAttr<S>;
  getAttrs: TypedGetAttrs<S>;
}

/**
 * The EARS query helpers typed against `S`. Returns the same singleton functions every
 * pack shares; only their types differ.
 */
export function defineEars<S extends EntityShapes>(): TypedEars<S> {
  return {
    qx, findById, findByIdRaw, findAll, findWhere, findFirst,
    findWithFields, findByIdWithFields, findWithRole, findFirstWithRole,
    createEntity, createEntityWithDefaults, updateEntity, getAttr, getAttrs,
  } as unknown as TypedEars<S>;
}
