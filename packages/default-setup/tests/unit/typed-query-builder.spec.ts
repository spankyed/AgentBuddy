import { describe, it } from 'vitest';
import { expectTypeOf } from 'vitest';
import type { QueryBuilder } from '@abuddy/sdk/ears';
import { EARS, qx, type PackShapes } from '@/__generated__/ears';

// ─── qx() overloads ────────────────────────────────────────────────────

describe('Typed QueryBuilder — qx() overloads', () => {
  it('qx(Entity.Action) returns QueryBuilder<"Action">', () => {
    expectTypeOf(qx(EARS.Entity.Action)).toEqualTypeOf<QueryBuilder<'Action', PackShapes>>();
  });

  it('qx(Entity.Thread) returns QueryBuilder<"Thread">', () => {
    expectTypeOf(qx(EARS.Entity.Thread)).toEqualTypeOf<QueryBuilder<'Thread', PackShapes>>();
  });

  it('qx(Entity.Flow) returns QueryBuilder<"Flow">', () => {
    expectTypeOf(qx(EARS.Entity.Flow)).toEqualTypeOf<QueryBuilder<'Flow', PackShapes>>();
  });

  it('qx(Entity.Document) returns QueryBuilder<"Document">', () => {
    expectTypeOf(qx(EARS.Entity.Document)).toEqualTypeOf<QueryBuilder<'Document', PackShapes>>();
  });

  it('qx(Entity.Prompt) returns QueryBuilder<"Prompt">', () => {
    expectTypeOf(qx(EARS.Entity.Prompt)).toEqualTypeOf<QueryBuilder<'Prompt', PackShapes>>();
  });

  it('qx() without args returns QueryBuilder<string, PackShapes>', () => {
    expectTypeOf(qx()).toEqualTypeOf<QueryBuilder<string, PackShapes>>();
  });

  it('qx(someEntityId) returns untyped QueryBuilder', () => {
    const id = 'act-123' as EARS.EntityId;
    expectTypeOf(qx(id)).toEqualTypeOf<QueryBuilder<string, PackShapes>>();
  });

  it('qx(idArray) returns untyped QueryBuilder', () => {
    const ids = ['act-1', 'act-2'] as EARS.EntityId[];
    expectTypeOf(qx(ids)).toEqualTypeOf<QueryBuilder<string, PackShapes>>();
  });
});

// ─── ofType() narrows ──────────────────────────────────────────────────

// Asserted via an instantiation expression (`typeof b.ofType<'Thread'>`) rather
// than a conditional type: `Q extends { ofType(t: T): infer R }` instantiates
// the generic at its CONSTRAINT and infers QueryBuilder<string, PackShapes>, so it silently
// passed whatever ofType actually returned. Purely type-level, so the declared
// consts need no runtime value.
declare const untypedBuilder: QueryBuilder<string, PackShapes>;
declare const threadBuilder: QueryBuilder<'Thread', PackShapes>;
declare const actionBuilder: QueryBuilder<'Action', PackShapes>;

describe('Typed QueryBuilder — ofType() narrows', () => {
  it('ofType() narrows untyped builder to specific entity', () => {
    expectTypeOf<ReturnType<typeof untypedBuilder.ofType<'Thread'>>>()
      .toEqualTypeOf<QueryBuilder<'Thread', PackShapes>>();
  });

  it('ofType() narrows from one entity to a different entity', () => {
    expectTypeOf<ReturnType<typeof actionBuilder.ofType<'Thread'>>>()
      .toEqualTypeOf<QueryBuilder<'Thread', PackShapes>>();
  });
});

// ─── fluent chaining preserves type ────────────────────────────────────

describe('Typed QueryBuilder — fluent chaining preserves type', () => {
  it('where() preserves entity type', () => {
    type Result = ReturnType<QueryBuilder<'Action', PackShapes>['where']>;
    expectTypeOf<Result>().toEqualTypeOf<QueryBuilder<'Action', PackShapes>>();
  });

  it('orderBy() preserves entity type', () => {
    type Result = ReturnType<QueryBuilder<'Thread', PackShapes>['orderBy']>;
    expectTypeOf<Result>().toEqualTypeOf<QueryBuilder<'Thread', PackShapes>>();
  });

  it('limit() preserves entity type', () => {
    type Result = ReturnType<QueryBuilder<'Flow', PackShapes>['limit']>;
    expectTypeOf<Result>().toEqualTypeOf<QueryBuilder<'Flow', PackShapes>>();
  });

  it('distinct() preserves entity type', () => {
    type Result = ReturnType<QueryBuilder<'Document', PackShapes>['distinct']>;
    expectTypeOf<Result>().toEqualTypeOf<QueryBuilder<'Document', PackShapes>>();
  });

  it('reverse() preserves entity type', () => {
    type Result = ReturnType<QueryBuilder<'Action', PackShapes>['reverse']>;
    expectTypeOf<Result>().toEqualTypeOf<QueryBuilder<'Action', PackShapes>>();
  });

  it('inIds() preserves entity type', () => {
    type Result = ReturnType<QueryBuilder<'Thread', PackShapes>['inIds']>;
    expectTypeOf<Result>().toEqualTypeOf<QueryBuilder<'Thread', PackShapes>>();
  });

  it('withRole() preserves entity type', () => {
    type Result = ReturnType<QueryBuilder<'Action', PackShapes>['withRole']>;
    expectTypeOf<Result>().toEqualTypeOf<QueryBuilder<'Action', PackShapes>>();
  });

  it('relatedTo() preserves entity type', () => {
    type Result = ReturnType<QueryBuilder<'Message', PackShapes>['relatedTo']>;
    expectTypeOf<Result>().toEqualTypeOf<QueryBuilder<'Message', PackShapes>>();
  });

  // linksTo navigates to related entities (relatedTo/related filter in place),
  // so the result holds the TARGET type, not the type being queried from.
  it('linksTo() narrows to the target entity type', () => {
    expectTypeOf<ReturnType<typeof threadBuilder.linksTo<'Message'>>>()
      .toEqualTypeOf<QueryBuilder<'Message', PackShapes>>();
  });

  it('forEach() preserves entity type', () => {
    type Result = ReturnType<QueryBuilder<'Action', PackShapes>['forEach']>;
    expectTypeOf<Result>().toEqualTypeOf<QueryBuilder<'Action', PackShapes>>();
  });
});

// ─── groupBy returns Map with typed builders ───────────────────────────

describe('Typed QueryBuilder — groupBy returns typed Map', () => {
  it('groupBy returns Map<unknown, QueryBuilder<E>>', () => {
    type Result = ReturnType<QueryBuilder<'Thread', PackShapes>['groupBy']>;
    expectTypeOf<Result>().toEqualTypeOf<Map<unknown, QueryBuilder<'Thread', PackShapes>>>();
  });
});

// ─── terminal methods ──────────────────────────────────────────────────

describe('Typed QueryBuilder — terminal methods', () => {
  it('ids() returns EntityId[]', () => {
    type Result = ReturnType<QueryBuilder<'Action', PackShapes>['ids']>;
    expectTypeOf<Result>().toEqualTypeOf<EARS.EntityId[]>();
  });

  it('id() returns EntityId | null', () => {
    type Result = ReturnType<QueryBuilder<'Action', PackShapes>['id']>;
    expectTypeOf<Result>().toEqualTypeOf<EARS.EntityId | null>();
  });

  it('count() returns number', () => {
    type Result = ReturnType<QueryBuilder<'Thread', PackShapes>['count']>;
    expectTypeOf<Result>().toBeNumber();
  });

  it('exists() returns boolean', () => {
    type Result = ReturnType<QueryBuilder<'Flow', PackShapes>['exists']>;
    expectTypeOf<Result>().toBeBoolean();
  });

  it('first() returns EntityId | null', () => {
    type Result = ReturnType<QueryBuilder<'Action', PackShapes>['first']>;
    expectTypeOf<Result>().toEqualTypeOf<EARS.EntityId | null>();
  });

  it('last() returns EntityId | null', () => {
    type Result = ReturnType<QueryBuilder<'Action', PackShapes>['last']>;
    expectTypeOf<Result>().toEqualTypeOf<EARS.EntityId | null>();
  });
});

// ─── default type parameter ────────────────────────────────────────────

describe('Typed QueryBuilder — default type parameter', () => {
  it('QueryBuilder without type args is an untyped string builder', () => {
    expectTypeOf<QueryBuilder>().toEqualTypeOf<QueryBuilder<string, {}>>();
  });

  it('untyped builder methods still return QueryBuilder<string>', () => {
    type Result = ReturnType<QueryBuilder['where']>;
    expectTypeOf<Result>().toEqualTypeOf<QueryBuilder<string>>();
  });
});
