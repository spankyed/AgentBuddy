/**
 * EARS query helpers typed against an entity shape map. This is the only pack-facing way
 * to get them: `abuddy generate-entries` writes `#generated/ears` with
 * `defineEars<PackShapes>()` (the pack's entities plus its dependencies'). There is no
 * global registry, so each pack's typing depends only on what it declares.
 */
import type { EARS, EntityShapes, ShapeOf } from '../types/entities.js';
import type { QueryBuilder } from './runtime.js';
import { qx, type QxSeed } from './query.js';
import { createEntity } from './attribute-storage.js';
import { findById, findByIdRaw, findAll, findWhere, findFirst } from './query-helpers.js';

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

export interface TypedEars<S extends EntityShapes> {
  qx: TypedQx<S>;
  findById: TypedFindById<S>;
  findByIdRaw: TypedFindById<S>;
  findAll: TypedFindAll<S>;
  findWhere: TypedFindWhere<S>;
  findFirst: TypedFindFirst<S>;
  createEntity: TypedCreateEntity<S>;
}

/**
 * The EARS query helpers typed against `S`. Returns the same singleton functions every
 * pack shares; only their types differ.
 */
export function defineEars<S extends EntityShapes>(): TypedEars<S> {
  return { qx, findById, findByIdRaw, findAll, findWhere, findFirst, createEntity } as unknown as TypedEars<S>;
}
