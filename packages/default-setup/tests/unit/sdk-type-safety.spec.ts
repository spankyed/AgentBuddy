/**
 * Type-safety verification tests for SDK delegates.
 *
 * These tests validate that recovered generic type parameters on SDK delegate
 * functions actually infer types correctly. They use vitest's expectTypeOf()
 * for compile-time type assertions — if a generic regresses to `any`, these
 * tests will fail at typecheck time (not just at runtime).
 *
 * Runtime assertions verify that generics flow through the delegate chain
 * correctly on the harness's in-memory engine.
 */
import { expectTypeOf, describe, it, expect, beforeEach } from 'vitest';
import { tx, type QueryBuilder, type TransactionBuilder } from '@abuddy/ears';
import {
  qx, createEntity, findById, findAll, findWhere, findFirst, createEntityWithDefaults, updateEntity, getAttr, findWithFields,
  type EntityShape, type PackShapes,
} from '@/__generated__/ears';
import { repository, type Repositories } from '@/__generated__/repository';
import { filterSystemFields } from '@abuddy/ears';
import { resetTestData } from '@abuddy/sdk/testing';
import { createLogger, type Logger } from '@abuddy/sdk/logger';
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
import { services, type Services } from '@/__generated__/services';
import { EARS } from '../../src/__generated__/ears';


// ─── Compile-time type assertions ──────────────────────────────────────
// Checked by `tsc` (npm run typecheck:pack). toEqualTypeOf, not toBeAny and expected errors fail
// when a delegate regresses to `any`; toHaveProperty and toMatchTypeOf would pass on `any`.

describe('Type inference — EARS runtime', () => {
  it('qx() returns a QueryBuilder typed with the pack shapes', () => {
    expectTypeOf(qx()).toEqualTypeOf<QueryBuilder<string, PackShapes>>();
  });

  it('tx() returns TransactionBuilder', () => {
    expectTypeOf(tx).returns.toEqualTypeOf<TransactionBuilder>();
  });

  it('createEntity() brands the id with a declared entity type', () => {
    expectTypeOf(createEntity(EARS.Entity.Action)).toEqualTypeOf<EARS.EntityId<'Action'>>();
  });

  it('QueryBuilder terminal methods are typed', () => {
    const builder = {} as QueryBuilder;
    expectTypeOf(builder.count).returns.toEqualTypeOf<number>();
    expectTypeOf(builder.exists).returns.toEqualTypeOf<boolean>();
    expectTypeOf(builder.ids).returns.not.toBeAny();
    expectTypeOf(builder.first).returns.not.toBeAny();
  });

  it('QueryBuilder.map() is generic over its return type', () => {
    const builder = {} as QueryBuilder;
    expectTypeOf(() => builder.map((id) => String(id))).returns.toEqualTypeOf<string[]>();
  });

  it('TransactionBuilder fluent methods return TransactionBuilder', () => {
    const builder = {} as TransactionBuilder;
    expectTypeOf(builder.put).returns.toEqualTypeOf<TransactionBuilder>();
    expectTypeOf(builder.batchPut).returns.toEqualTypeOf<TransactionBuilder>();
    expectTypeOf(builder.link).returns.toEqualTypeOf<TransactionBuilder>();
  });
});

describe('Type inference — typed EARS helpers', () => {
  const actionId = 'Action-1' as EARS.EntityId<'Action'>;

  it('findById with a branded id reads the declared shape', () => {
    expectTypeOf(() => findById(actionId)!.actionFn).returns.toEqualTypeOf<string>();
  });

  it('findAll, findWhere and findFirst read the declared shape', () => {
    // Wrapped in functions: only their types are checked
    expectTypeOf(() => findAll(EARS.Entity.Prompt)[0].templateFn).returns.not.toBeAny();
    expectTypeOf(() => findWhere(EARS.Entity.Thread, 'status', 'active')[0].topic).returns.toEqualTypeOf<string>();
    expectTypeOf(() => findFirst(EARS.Entity.Thread, 'status', 'active')!.status).returns.toEqualTypeOf<string>();
  });

  it('createEntityWithDefaults returns the declared shape with the created fields', () => {
    const result = createEntityWithDefaults(EARS.Entity.Action, { label: 'test', actionFn: 'fn()' });
    expectTypeOf(result.actionFn).toEqualTypeOf<string>();
    expectTypeOf(result.shortCode).toEqualTypeOf<string>();
    // @ts-expect-error not a field of Action
    createEntityWithDefaults(EARS.Entity.Action, { notAField: 1 });
  });

  it('updateEntity accepts only declared fields', () => {
    updateEntity(actionId, { label: 'renamed', description: null });
    // @ts-expect-error wrong type for a declared field
    updateEntity(actionId, { label: 42 });
  });

  it('getAttr reads a declared field of a branded id, unknown otherwise', () => {
    expectTypeOf(getAttr(actionId, 'actionFn')).toEqualTypeOf<string | null>();
    expectTypeOf(getAttr('x' as EARS.EntityId, 'actionFn')).toBeUnknown();
  });

  it('findWithFields picks the requested fields', () => {
    expectTypeOf(findWithFields(EARS.Entity.Action, ['label', 'actionFn'])[0]).toEqualTypeOf<Pick<EntityShape<'Action'>, 'label' | 'actionFn'>>();
    // @ts-expect-error not a field of Action
    findWithFields(EARS.Entity.Action, ['notAField']);
  });

  it('filterSystemFields<T> preserves the generic shape', () => {
    type Entity = { label: string; status: string; entityType: string };
    expectTypeOf(filterSystemFields<Entity>).returns.not.toBeAny();
  });
});

describe('Type inference — Logger and utilities', () => {
  it('createLogger returns Logger', () => {
    expectTypeOf(createLogger).returns.toEqualTypeOf<Logger>();
  });

  it('loadJSON<T> returns T | null', () => {
    type Config = { version: number; features: string[] };
    expectTypeOf(loadJSON<Config>).returns.toEqualTypeOf<Config | null>();
  });

  it('detectChanges<T> returns DiffResult<T>', () => {
    type Item = { name: string; slug: string };
    expectTypeOf<ReturnType<typeof detectChanges<Item>>>().toEqualTypeOf<DiffResult<Item>>();
  });

  it('toIdentifierSet<T> returns Set<string>', () => {
    type Tag = { name: string; slug: string };
    expectTypeOf(toIdentifierSet<Tag>).returns.toEqualTypeOf<Set<string>>();
  });

  it('ChangeBlock<T> is generic', () => {
    type Action = { name: string };
    expectTypeOf<ChangeBlock<Action>['removed']>().not.toBeAny();
  });

  it('SeedCounts fields are numbers', () => {
    expectTypeOf<SeedCounts['created']>().toEqualTypeOf<number>();
  });
});

describe('Type inference — FE delegate generics', () => {
  it('breadcrumb helpers return typed configs', () => {
    expectTypeOf(breadcrumb).returns.not.toBeAny();
    expectTypeOf(breadcrumbWithParams<{ selectedId: string }>).returns.not.toBeAny();
    expectTypeOf(breadcrumbList<{ items: string[] }>).returns.not.toBeAny();
    expectTypeOf(contextMenuFn<{ selectedAction: string }>).returns.not.toBeAny();
  });
});

// ─── Generated facades ───────────────────────────────────────────────

describe('Generated services', () => {
  it('types feature, host and repository services, never any', () => {
    expectTypeOf(services).not.toBeAny();
    expectTypeOf(services.inference.generateText).not.toBeAny();
    expectTypeOf(services.prompt.usePrompt).not.toBeAny();
    expectTypeOf(services.logger).toEqualTypeOf<Logger>();
    expectTypeOf(services.repository.settingsQueries.getPluginSettings).not.toBeAny();
    expectTypeOf<Services['repository']>().toEqualTypeOf<Repositories>();
  });

  it('rejects a service that is not registered', () => {
    // @ts-expect-error not a service of this pack, its dependencies or the host
    void services.notAService;
  });
});

describe('Generated repository', () => {
  it('types each declared repository', () => {
    expectTypeOf(() => repository.flowsCommands.createFlow).returns.not.toBeAny();
    // @ts-expect-error not a declared repository
    expectTypeOf(() => repository.notARepository).returns.toBeUnknown();
  });
});

// ─── Runtime assertions ────────────────────────────────────────────────
// These verify that generics flow through the actual delegate chain at runtime.

describe('Generic flow — runtime verification', () => {
  beforeEach(() => resetTestData());

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

    const entity: ActionData & { id: EARS.EntityId; entityType: EARS.Entity } = createEntityWithDefaults(
      EARS.Entity.Action,
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
