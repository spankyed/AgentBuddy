import { describe, it } from 'vitest';
import { expectTypeOf } from 'vitest';
import type { EntityShape, EntityShapeRegistry } from '@abuddy/sdk/types';
import type { QueryBuilder } from '@abuddy/sdk/ears';
import { createEntity } from '@abuddy/sdk/ears';
import { findById } from '@abuddy/sdk/ears';
import { EARS } from '@/__generated__/ears';
import '@/__generated__/entity-shapes';

// ─── EntityId<E> phantom brand ─────────────────────────────────────────

describe('Branded EntityId — phantom type parameter', () => {
  it('EntityId defaults to EntityId<string>', () => {
    expectTypeOf<EARS.EntityId>().toEqualTypeOf<EARS.EntityId<string>>();
  });

  it('EntityId<"Action"> is assignable to EntityId<string>', () => {
    expectTypeOf<EARS.EntityId<'Action'>>().toMatchTypeOf<EARS.EntityId>();
  });

  it('EntityId retains template literal pattern', () => {
    expectTypeOf<'act-123'>().toMatchTypeOf<EARS.EntityId>();
  });

  it('EntityId<"Action"> is distinct from EntityId<"Thread">', () => {
    expectTypeOf<EARS.EntityId<'Action'>>().not.toEqualTypeOf<EARS.EntityId<'Thread'>>();
  });
});

// ─── createEntity overloads ────────────────────────────────────────────

describe('Branded EntityId — createEntity overloads', () => {
  it('createEntity(Entity.Action) returns EntityId<"Action">', () => {
    expectTypeOf(createEntity(EARS.Entity.Action)).toEqualTypeOf<EARS.EntityId<'Action'>>();
  });

  it('createEntity(Entity.Thread) returns EntityId<"Thread">', () => {
    expectTypeOf(createEntity(EARS.Entity.Thread)).toEqualTypeOf<EARS.EntityId<'Thread'>>();
  });

  it('createEntity(Entity.Flow) returns EntityId<"Flow">', () => {
    expectTypeOf(createEntity(EARS.Entity.Flow)).toEqualTypeOf<EARS.EntityId<'Flow'>>();
  });

  it('createEntity with unregistered entity returns EntityId<string>', () => {
    expectTypeOf(createEntity('SomeUnregistered')).toEqualTypeOf<EARS.EntityId>();
  });
});

// ─── findById with branded id ──────────────────────────────────────────

type InferFindById<E extends string> =
  EARS.EntityId<E> extends EARS.EntityId<infer R>
    ? R extends keyof EntityShapeRegistry
      ? EntityShape<R> | undefined
      : unknown
    : unknown;

describe('Branded EntityId — findById inference', () => {
  it('findById with branded EntityId<"Action"> returns EntityShape<"Action">', () => {
    type Result = InferFindById<'Action'>;
    expectTypeOf<Result>().toHaveProperty('label');
    expectTypeOf<Result>().toHaveProperty('actionFn');
    expectTypeOf<Result>().toHaveProperty('id');
  });

  it('findById overload: branded id narrows to EntityShape', () => {
    type FindByIdBranded = (id: EARS.EntityId<'Thread'>) => EntityShape<'Thread'> | undefined;
    const typedFind: FindByIdBranded = findById;
    expectTypeOf(typedFind).returns.toMatchTypeOf<EntityShape<'Thread'> | undefined>();
  });

  it('findById overload: explicit T still works', () => {
    type Custom = { myField: string };
    const typedFind: (id: EARS.EntityId) => Custom | undefined = findById;
    expectTypeOf(typedFind).returns.toMatchTypeOf<Custom | undefined>();
  });
});

// ─── branded id flows through QueryBuilder ─────────────────────────────

describe('Branded EntityId — integration with QueryBuilder', () => {
  it('qx(Entity.Action) ids should be branded EntityId', () => {
    type Result = ReturnType<QueryBuilder<'Action'>['ids']>;
    expectTypeOf<Result>().toEqualTypeOf<EARS.EntityId[]>();
  });

  it('createEntity returns branded id compatible with qx input', () => {
    type CreatedId = ReturnType<typeof createEntity<'Action'>>;
    expectTypeOf<CreatedId>().toMatchTypeOf<EARS.EntityId>();
  });
});
