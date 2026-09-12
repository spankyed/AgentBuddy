import { describe, it } from 'vitest';
import { expectTypeOf } from 'vitest';
import type { QueryBuilder } from '@abuddy/sdk/ears';
import { qx } from '@abuddy/sdk/ears';
import { EARS } from '@/__generated__/ears';
import '@/__generated__/entity-shapes';

// ─── qx() overloads ────────────────────────────────────────────────────

describe('Typed QueryBuilder — qx() overloads', () => {
  it('qx(Entity.Action) returns QueryBuilder<"Action">', () => {
    expectTypeOf(qx(EARS.Entity.Action)).toEqualTypeOf<QueryBuilder<'Action'>>();
  });

  it('qx(Entity.Thread) returns QueryBuilder<"Thread">', () => {
    expectTypeOf(qx(EARS.Entity.Thread)).toEqualTypeOf<QueryBuilder<'Thread'>>();
  });

  it('qx(Entity.Flow) returns QueryBuilder<"Flow">', () => {
    expectTypeOf(qx(EARS.Entity.Flow)).toEqualTypeOf<QueryBuilder<'Flow'>>();
  });

  it('qx(Entity.Document) returns QueryBuilder<"Document">', () => {
    expectTypeOf(qx(EARS.Entity.Document)).toEqualTypeOf<QueryBuilder<'Document'>>();
  });

  it('qx(Entity.Prompt) returns QueryBuilder<"Prompt">', () => {
    expectTypeOf(qx(EARS.Entity.Prompt)).toEqualTypeOf<QueryBuilder<'Prompt'>>();
  });

  it('qx() without args returns QueryBuilder<string>', () => {
    expectTypeOf(qx()).toEqualTypeOf<QueryBuilder<string>>();
  });

  it('qx(someEntityId) returns untyped QueryBuilder', () => {
    const id = 'act-123' as EARS.EntityId;
    expectTypeOf(qx(id)).toEqualTypeOf<QueryBuilder<string>>();
  });

  it('qx(idArray) returns untyped QueryBuilder', () => {
    const ids = ['act-1', 'act-2'] as EARS.EntityId[];
    expectTypeOf(qx(ids)).toEqualTypeOf<QueryBuilder<string>>();
  });
});

// ─── ofType() narrows ──────────────────────────────────────────────────

// Asserted via an instantiation expression (`typeof b.ofType<'Thread'>`) rather
// than a conditional type: `Q extends { ofType(t: T): infer R }` instantiates
// the generic at its CONSTRAINT and infers QueryBuilder<string>, so it silently
// passed whatever ofType actually returned. Purely type-level, so the declared
// consts need no runtime value.
declare const untypedBuilder: QueryBuilder;
declare const actionBuilder: QueryBuilder<'Action'>;

describe('Typed QueryBuilder — ofType() narrows', () => {
  it('ofType() narrows untyped builder to specific entity', () => {
    expectTypeOf<ReturnType<typeof untypedBuilder.ofType<'Thread'>>>()
      .toEqualTypeOf<QueryBuilder<'Thread'>>();
  });

  it('ofType() narrows from one entity to a different entity', () => {
    expectTypeOf<ReturnType<typeof actionBuilder.ofType<'Thread'>>>()
      .toEqualTypeOf<QueryBuilder<'Thread'>>();
  });
});

// ─── fluent chaining preserves type ────────────────────────────────────

describe('Typed QueryBuilder — fluent chaining preserves type', () => {
  it('where() preserves entity type', () => {
    type Result = ReturnType<QueryBuilder<'Action'>['where']>;
    expectTypeOf<Result>().toEqualTypeOf<QueryBuilder<'Action'>>();
  });

  it('orderBy() preserves entity type', () => {
    type Result = ReturnType<QueryBuilder<'Thread'>['orderBy']>;
    expectTypeOf<Result>().toEqualTypeOf<QueryBuilder<'Thread'>>();
  });

  it('limit() preserves entity type', () => {
    type Result = ReturnType<QueryBuilder<'Flow'>['limit']>;
    expectTypeOf<Result>().toEqualTypeOf<QueryBuilder<'Flow'>>();
  });

  it('distinct() preserves entity type', () => {
    type Result = ReturnType<QueryBuilder<'Document'>['distinct']>;
    expectTypeOf<Result>().toEqualTypeOf<QueryBuilder<'Document'>>();
  });

  it('reverse() preserves entity type', () => {
    type Result = ReturnType<QueryBuilder<'Action'>['reverse']>;
    expectTypeOf<Result>().toEqualTypeOf<QueryBuilder<'Action'>>();
  });

  it('inIds() preserves entity type', () => {
    type Result = ReturnType<QueryBuilder<'Thread'>['inIds']>;
    expectTypeOf<Result>().toEqualTypeOf<QueryBuilder<'Thread'>>();
  });

  it('withRole() preserves entity type', () => {
    type Result = ReturnType<QueryBuilder<'Action'>['withRole']>;
    expectTypeOf<Result>().toEqualTypeOf<QueryBuilder<'Action'>>();
  });

  it('relatedTo() preserves entity type', () => {
    type Result = ReturnType<QueryBuilder<'Message'>['relatedTo']>;
    expectTypeOf<Result>().toEqualTypeOf<QueryBuilder<'Message'>>();
  });

  it('linksTo() preserves entity type', () => {
    type Result = ReturnType<QueryBuilder<'Thread'>['linksTo']>;
    expectTypeOf<Result>().toEqualTypeOf<QueryBuilder<'Thread'>>();
  });

  it('forEach() preserves entity type', () => {
    type Result = ReturnType<QueryBuilder<'Action'>['forEach']>;
    expectTypeOf<Result>().toEqualTypeOf<QueryBuilder<'Action'>>();
  });
});

// ─── groupBy returns Map with typed builders ───────────────────────────

describe('Typed QueryBuilder — groupBy returns typed Map', () => {
  it('groupBy returns Map<unknown, QueryBuilder<E>>', () => {
    type Result = ReturnType<QueryBuilder<'Thread'>['groupBy']>;
    expectTypeOf<Result>().toEqualTypeOf<Map<unknown, QueryBuilder<'Thread'>>>();
  });
});

// ─── terminal methods ──────────────────────────────────────────────────

describe('Typed QueryBuilder — terminal methods', () => {
  it('ids() returns EntityId[]', () => {
    type Result = ReturnType<QueryBuilder<'Action'>['ids']>;
    expectTypeOf<Result>().toEqualTypeOf<EARS.EntityId[]>();
  });

  it('id() returns EntityId | null', () => {
    type Result = ReturnType<QueryBuilder<'Action'>['id']>;
    expectTypeOf<Result>().toEqualTypeOf<EARS.EntityId | null>();
  });

  it('count() returns number', () => {
    type Result = ReturnType<QueryBuilder<'Thread'>['count']>;
    expectTypeOf<Result>().toBeNumber();
  });

  it('exists() returns boolean', () => {
    type Result = ReturnType<QueryBuilder<'Flow'>['exists']>;
    expectTypeOf<Result>().toBeBoolean();
  });

  it('first() returns EntityId | null', () => {
    type Result = ReturnType<QueryBuilder<'Action'>['first']>;
    expectTypeOf<Result>().toEqualTypeOf<EARS.EntityId | null>();
  });

  it('last() returns EntityId | null', () => {
    type Result = ReturnType<QueryBuilder<'Action'>['last']>;
    expectTypeOf<Result>().toEqualTypeOf<EARS.EntityId | null>();
  });
});

// ─── default type parameter ────────────────────────────────────────────

describe('Typed QueryBuilder — default type parameter', () => {
  it('QueryBuilder without type arg defaults to string', () => {
    expectTypeOf<QueryBuilder>().toEqualTypeOf<QueryBuilder<string>>();
  });

  it('untyped builder methods still return QueryBuilder<string>', () => {
    type Result = ReturnType<QueryBuilder['where']>;
    expectTypeOf<Result>().toEqualTypeOf<QueryBuilder<string>>();
  });
});
