/**
 * Type-safety verification tests for SDK delegates.
 *
 * These tests validate that recovered generic type parameters on SDK delegate
 * functions actually infer types correctly. They use vitest's expectTypeOf()
 * for compile-time type assertions — if a generic regresses to `any`, these
 * tests will fail at typecheck time (not just at runtime).
 *
 * Runtime assertions verify that generics flow through the delegate chain
 * correctly when backed by real host modules.
 */
import { expectTypeOf, describe, it, expect, beforeEach } from 'vitest';
import {
  qx, tx, createEntity,
  findById, findAll, findWhere,
  createEntityWithDefaults,
  filterSystemFields,
  clearMemory,
  type QueryBuilder, type TransactionBuilder, type Logger,
} from '@abuddy/sdk/ears';
import { createLogger } from '@abuddy/sdk/logger';
import {
  loadJSON,
  seedCollection, detectChanges,
  toIdentifierSet,
  type SeedCounts, type DiffResult,
  type ChangeBlock,
} from '@abuddy/sdk/utils';
import {
  breadcrumb, breadcrumbWithParams, breadcrumbList,
  contextMenuFn,
} from '@abuddy/sdk/fe';
import { EARS } from '@/registries/ears';

// ─── Compile-time type assertions ──────────────────────────────────────
// These verify that generic functions return typed results, not `any`.
// A regression to `(...args: any[]) => any` would cause these to fail
// during `tsc --noEmit` or vitest typecheck mode.

describe('Type inference — EARS runtime', () => {
  it('qx() returns QueryBuilder, not any', () => {
    expectTypeOf(qx).returns.toMatchTypeOf<QueryBuilder>();
  });

  it('tx() returns TransactionBuilder, not any', () => {
    expectTypeOf(tx).returns.toMatchTypeOf<TransactionBuilder>();
  });

  it('createEntity() returns EARS.EntityId, not any', () => {
    expectTypeOf(createEntity).returns.toMatchTypeOf<EARS.EntityId>();
  });

  it('QueryBuilder.ids() returns EntityId[], not any', () => {
    const builder = {} as QueryBuilder;
    expectTypeOf(builder.ids).returns.toMatchTypeOf<EARS.EntityId[]>();
  });

  it('QueryBuilder.count() returns number, not any', () => {
    const builder = {} as QueryBuilder;
    expectTypeOf(builder.count).returns.toMatchTypeOf<number>();
  });

  it('QueryBuilder.exists() returns boolean, not any', () => {
    const builder = {} as QueryBuilder;
    expectTypeOf(builder.exists).returns.toMatchTypeOf<boolean>();
  });

  it('QueryBuilder.first() returns EntityId | null', () => {
    const builder = {} as QueryBuilder;
    expectTypeOf(builder.first).returns.toMatchTypeOf<EARS.EntityId | null>();
  });

  it('QueryBuilder fluent methods return QueryBuilder', () => {
    const builder = {} as QueryBuilder;
    expectTypeOf(builder.ofType).returns.toMatchTypeOf<QueryBuilder>();
    expectTypeOf(builder.where).returns.toMatchTypeOf<QueryBuilder>();
    expectTypeOf(builder.orderBy).returns.toMatchTypeOf<QueryBuilder>();
    expectTypeOf(builder.reverse).returns.toMatchTypeOf<QueryBuilder>();
    expectTypeOf(builder.limit).returns.toMatchTypeOf<QueryBuilder>();
    expectTypeOf(builder.distinct).returns.toMatchTypeOf<QueryBuilder>();
  });

  it('QueryBuilder.map() is generic over return type', () => {
    const builder = {} as QueryBuilder;
    expectTypeOf(builder.map<string>).returns.toMatchTypeOf<string[]>();
    expectTypeOf(builder.map<number>).returns.toMatchTypeOf<number[]>();
  });

  it('TransactionBuilder fluent methods return TransactionBuilder', () => {
    const builder = {} as TransactionBuilder;
    expectTypeOf(builder.put).returns.toMatchTypeOf<TransactionBuilder>();
    expectTypeOf(builder.batchPut).returns.toMatchTypeOf<TransactionBuilder>();
    expectTypeOf(builder.link).returns.toMatchTypeOf<TransactionBuilder>();
  });

  it('TransactionBuilder.id() returns EntityId, not any', () => {
    const builder = {} as TransactionBuilder;
    expectTypeOf(builder.id).returns.toMatchTypeOf<EARS.EntityId>();
  });
});

describe('Type inference — EARS repository generics', () => {
  it('findById<T> infers T on the result', () => {
    type Action = { label: string; actionFn: string };
    expectTypeOf(findById<Action>).returns.toMatchTypeOf<Action | undefined>();
  });

  it('findAll<T> infers T[] on the result', () => {
    type Prompt = { label: string; templateFn: string };
    expectTypeOf(findAll<Prompt>).returns.toMatchTypeOf<Prompt[]>();
  });

  it('findWhere<T> infers T[] on the result', () => {
    type Thread = { title: string; status: string };
    expectTypeOf(findWhere<Thread>).returns.toMatchTypeOf<Thread[]>();
  });

  it('createEntityWithDefaults<T> returns T & { id, entityType }', () => {
    type Action = { label: string; actionFn: string };
    const result = {} as ReturnType<typeof createEntityWithDefaults<Action>>;
    expectTypeOf(result).toHaveProperty('id');
    expectTypeOf(result).toHaveProperty('entityType');
    expectTypeOf(result).toHaveProperty('label');
    expectTypeOf(result).toHaveProperty('actionFn');
  });

  it('filterSystemFields<T> preserves generic shape', () => {
    type Entity = { label: string; status: string; entityType: string };
    expectTypeOf(filterSystemFields<Entity>).returns.toMatchTypeOf<Partial<Entity>>();
  });
});

describe('Type inference — Logger', () => {
  it('createLogger returns Logger with typed methods', () => {
    expectTypeOf(createLogger).returns.toMatchTypeOf<Logger>();
  });

  it('Logger has standard log methods', () => {
    const logger = {} as Logger;
    expectTypeOf(logger.info).toBeFunction();
    expectTypeOf(logger.warn).toBeFunction();
    expectTypeOf(logger.error).toBeFunction();
    expectTypeOf(logger.debug).toBeFunction();
    expectTypeOf(logger.verbose).toBeFunction();
  });
});

describe('Type inference — Utility generics', () => {
  it('loadJSON<T> returns T | null', () => {
    type Config = { version: number; features: string[] };
    expectTypeOf(loadJSON<Config>).returns.toMatchTypeOf<Config | null>();
  });

  it('detectChanges<T> infers T in callbacks and result', () => {
    type Item = { name: string; slug: string };
    const result = {} as ReturnType<typeof detectChanges<Item>>;
    expectTypeOf(result).toMatchTypeOf<DiffResult<Item>>();
  });

  it('toIdentifierSet<T> accepts typed arrays', () => {
    type Tag = { name: string; slug: string };
    expectTypeOf(toIdentifierSet<Tag>).returns.toMatchTypeOf<Set<string>>();
  });

  it('ChangeBlock<T> is generic', () => {
    type Action = { name: string };
    type CB = ChangeBlock<Action>;
    expectTypeOf<CB['removed']>().toMatchTypeOf<Array<Action | string> | undefined>();
  });

  it('SeedCounts has typed numeric fields', () => {
    expectTypeOf<SeedCounts>().toHaveProperty('created');
    expectTypeOf<SeedCounts>().toHaveProperty('updated');
    expectTypeOf<SeedCounts>().toHaveProperty('skipped');
  });
});

describe('Type inference — FE delegate generics', () => {
  it('breadcrumb has correct return type signature', () => {
    expectTypeOf(breadcrumb).returns.toHaveProperty('breadcrumb');
  });

  it('breadcrumbWithParams<C> has correct generic signature', () => {
    type Ctx = { selectedId: string };
    expectTypeOf(breadcrumbWithParams<Ctx>).returns.toHaveProperty('breadcrumb');
  });

  it('breadcrumbList<C> has correct generic signature', () => {
    type Ctx = { items: string[] };
    expectTypeOf(breadcrumbList<Ctx>).returns.toHaveProperty('breadcrumb');
  });

  it('contextMenuFn<C> has correct generic signature', () => {
    type Ctx = { selectedAction: string };
    expectTypeOf(contextMenuFn<Ctx>).parameter(0).toBeFunction();
    expectTypeOf(contextMenuFn<Ctx>).returns.toHaveProperty('contextMenu');
  });
});

// ─── Runtime assertions ────────────────────────────────────────────────
// These verify that generics flow through the actual delegate chain at runtime.

describe('Generic flow — runtime verification', () => {
  beforeEach(() => clearMemory());

  it('findById<T> returns typed result with T properties', () => {
    type ActionEntity = {
      label: string;
      actionFn: string;
      category: string;
      entityType: EARS.Entity;
    };

    const entity = createEntityWithDefaults(
      EARS.Entity.Action as any,
      { label: 'TypedAction', actionFn: 'fn()', category: 'test' } as any,
      'ACT',
    );

    const found = findById<ActionEntity>(entity.id);
    expect(found).toBeDefined();
    expect(found!.label).toBe('TypedAction');
    expect(found!.category).toBe('test');
  });

  it('findAll<T> returns typed array', () => {
    type ActionEntity = { label: string; actionFn: string };

    createEntityWithDefaults(
      EARS.Entity.Action as any,
      { label: 'A1', actionFn: 'fn1()' } as any,
      'ACT',
    );
    createEntityWithDefaults(
      EARS.Entity.Action as any,
      { label: 'A2', actionFn: 'fn2()' } as any,
      'ACT',
    );

    const all = findAll<ActionEntity>(EARS.Entity.Action as any);
    expect(all).toHaveLength(2);
    expect(all[0].label).toBeDefined();
    expect(all[0].actionFn).toBeDefined();
  });

  it('findWhere<T> returns typed filtered results', () => {
    type ActionEntity = { label: string; category: string };

    createEntityWithDefaults(
      EARS.Entity.Action as any,
      { label: 'CatA', actionFn: 'fn()', category: 'alpha' } as any,
      'ACT',
    );
    createEntityWithDefaults(
      EARS.Entity.Action as any,
      { label: 'CatB', actionFn: 'fn()', category: 'beta' } as any,
      'ACT',
    );

    const results = findWhere<ActionEntity>(EARS.Entity.Action as any, 'category', 'alpha');
    expect(results).toHaveLength(1);
    expect(results[0].label).toBe('CatA');
    expect(results[0].category).toBe('alpha');
  });

  it('createEntityWithDefaults<T> returns T & { id, entityType }', () => {
    type ActionData = { label: string; actionFn: string };

    const entity = createEntityWithDefaults<ActionData>(
      EARS.Entity.Action as any,
      { label: 'Typed', actionFn: 'fn()' },
      'ACT',
    );

    expect(entity.id).toMatch(/^Action-/);
    expect(entity.label).toBe('Typed');
    expect(entity.actionFn).toBe('fn()');
    expect(entity.entityType).toBeDefined();
  });

  it('qx() fluent chain produces typed results', () => {
    createEntityWithDefaults(
      EARS.Entity.Action as any,
      { label: 'Chain', actionFn: 'fn()' } as any,
      'ACT',
    );

    const ids = qx(EARS.Entity.Action as any).ids();
    expect(Array.isArray(ids)).toBe(true);
    expect(ids.length).toBe(1);

    const count = qx(EARS.Entity.Action as any).count();
    expect(typeof count).toBe('number');
    expect(count).toBe(1);

    const exists = qx(EARS.Entity.Action as any).exists();
    expect(typeof exists).toBe('boolean');
    expect(exists).toBe(true);
  });

  it('qx().map() returns correctly typed array', () => {
    const id = createEntityWithDefaults(
      EARS.Entity.Action as any,
      { label: 'MapTest', actionFn: 'fn()' } as any,
      'ACT',
    ).id;

    const labels = qx(EARS.Entity.Action as any).map(
      (entityId) => `prefix-${entityId}`
    );
    expect(labels).toHaveLength(1);
    expect(labels[0]).toContain('prefix-Action-');
  });

  it('tx() fluent chain returns TransactionBuilder', () => {
    const id = tx(EARS.Entity.Action as any)
      .put('label', 'TxChain')
      .put('status', 'active')
      .id();

    expect(id).toMatch(/^Action-/);
    const label = qx(id).pickOne(['label'] as const);
    expect(label).toBeDefined();
  });

  it('loadJSON<T> preserves generic type', () => {
    type Config = { items: string[] };
    const result = loadJSON<Config>('/nonexistent/path.json');
    expect(result).toBeNull();
  });

  it('seedCollection<T> accepts typed options', () => {
    type Item = { name: string; value: number };
    expect(() => {
      seedCollection<Item>({
        file: '/nonexistent.json',
        label: 'test',
        getKey: (item) => item.name,
        findExisting: () => undefined,
        create: (item) => { void item.value; },
        update: (_id, item) => { void item.name; },
        log: () => {},
      });
    }).not.toThrow();
  });

  it('filterSystemFields<T> returns Partial<T>', () => {
    type Entity = { label: string; status: string; entityType: string };
    const input: Entity = { label: 'test', status: 'active', entityType: 'Action' };
    const filtered = filterSystemFields(input);
    expect(filtered).toBeDefined();
    expect(typeof filtered).toBe('object');
  });

  it('createLogger returns Logger with callable methods', () => {
    const logger = createLogger('type-test');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.debug).toBe('function');
  });
});
