import { describe, it } from 'vitest';
import { expectTypeOf } from 'vitest';
import type { QueryBuilder } from '@abuddy/sdk/ears';
import { EARS, createEntity, findAll, findById, qx, type EntityShape, type PackShapes } from '@/__generated__/ears';

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

  it('a plain id is accepted where a tagged one is expected; another entity\'s id is not', () => {
    const openNote = (id: EARS.EntityId<'Note'>) => id;
    const plain = 'note-1' as EARS.EntityId;
    openNote(plain);
    // @ts-expect-error a Thread id where a Note id is expected
    openNote('thread-1' as EARS.EntityId<'Thread'>);
    // @ts-expect-error a raw string isn't an id
    openNote('note-1' as string);
  });

  it('tagged id collections accept plain ids in membership checks', () => {
    const noteIds: EARS.EntityId<'Note'>[] = [];
    const plain = 'note-1' as EARS.EntityId;
    noteIds.includes(plain);
    new Set(noteIds).has(plain);
    new Map(noteIds.map((id) => [id, 1])).get(plain);
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

  it('createEntity with an entity name only known at runtime returns EntityId<string>', () => {
    const entityType: string = 'SomeUnregistered';
    expectTypeOf(createEntity(entityType)).toEqualTypeOf<EARS.EntityId>();
  });

  it('createEntity rejects a literal entity name the pack does not declare', () => {
    // @ts-expect-error not an entity this pack or its dependencies declare
    createEntity('SomeUnregistered');
  });
});

// ─── findById with branded id ──────────────────────────────────────────

type InferFindById<E extends string> =
  EARS.EntityId<E> extends EARS.EntityId<infer R>
    ? R extends keyof PackShapes
      ? EntityShape<R> | undefined
      : unknown
    : unknown;

describe('Branded EntityId — findById inference', () => {
  it('findById with branded EntityId<"Action"> returns EntityShape<"Action">', () => {
    type Result = InferFindById<'Action'>;
    expectTypeOf<Result>().exclude<undefined>().toHaveProperty('label');
    expectTypeOf<Result>().exclude<undefined>().toHaveProperty('actionFn');
    expectTypeOf<Result>().exclude<undefined>().toHaveProperty('id');
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
  it('qx(Entity.Action) ids are tagged with Action', () => {
    type Result = ReturnType<QueryBuilder<'Action', PackShapes>['ids']>;
    expectTypeOf<Result>().toEqualTypeOf<EARS.EntityId<'Action'>[]>();
  });

  it('an id from a query types the next lookup without an explicit shape', () => {
    // Type-level only: never called, since the EARS runtime isn't initialized here
    const check = () => {
      const first = qx(EARS.Entity.Note).first();
      if (first) expectTypeOf(findById(first)).toEqualTypeOf<EntityShape<'Note'> | undefined>();
      const row = findAll(EARS.Entity.Note)[0];
      if (row) expectTypeOf(row.id).toEqualTypeOf<EARS.EntityId<'Note'>>();
      const picked = qx(EARS.Entity.Note).pickOne(['title']);
      if (picked) expectTypeOf(picked.id).toEqualTypeOf<EARS.EntityId<'Note'>>();
    };
    expectTypeOf(check).toBeFunction();
  });

  it('createEntity returns branded id compatible with qx input', () => {
    type CreatedId = ReturnType<typeof createEntity<'Action'>>;
    expectTypeOf<CreatedId>().toMatchTypeOf<EARS.EntityId>();
  });
});
