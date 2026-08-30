import { describe, it, expect, afterEach } from 'vitest';
import { expectTypeOf } from 'vitest';
import {
  registerHostModule,
  getHostModule,
  type HostModuleContracts,
  type HostModuleKey,
} from '@abuddy/sdk/runtime';
import type { EARS } from '@abuddy/sdk/types';
import type { QueryBuilder, Logger } from '@abuddy/sdk/ears';

// ─── Compile-time contract verification ─────────────────────────────
// These tests verify that HostModuleContracts enforces the correct
// shapes at the type level. If a contract regresses, these fail
// during typecheck, not at runtime.

describe('Host module contracts — compile-time', () => {
  it('HostModuleKey is a union of all known module keys', () => {
    expectTypeOf<HostModuleKey>().toMatchTypeOf<string>();
    expectTypeOf<'paths'>().toMatchTypeOf<HostModuleKey>();
    expectTypeOf<'shared-repository'>().toMatchTypeOf<HostModuleKey>();
    expectTypeOf<'logger'>().toMatchTypeOf<HostModuleKey>();
    expectTypeOf<'event-emitter'>().toMatchTypeOf<HostModuleKey>();
    expectTypeOf<'breadcrumb'>().toMatchTypeOf<HostModuleKey>();
    expectTypeOf<'attribute-storage'>().toMatchTypeOf<HostModuleKey>();
  });

  it('getHostModule returns typed contract for known keys', () => {
    expectTypeOf(getHostModule('paths')).toHaveProperty('getMediaPath');
    expectTypeOf(getHostModule('paths')).toHaveProperty('createExportDir');
    expectTypeOf(getHostModule('paths')).toHaveProperty('ensureDirectoryExists');
  });

  it('getHostModule("shared-repository") has generic findById', () => {
    const repo = {} as HostModuleContracts['shared-repository'];
    expectTypeOf(repo.findById<{ label: string }>).returns
      .toEqualTypeOf<{ label: string } | undefined>();
  });

  it('getHostModule("shared-repository") has generic findAll', () => {
    const repo = {} as HostModuleContracts['shared-repository'];
    expectTypeOf(repo.findAll<{ name: string }>).returns
      .toEqualTypeOf<{ name: string }[]>();
  });

  it('getHostModule("shared-repository") has generic createEntityWithDefaults', () => {
    const repo = {} as HostModuleContracts['shared-repository'];
    type Action = { label: string; actionFn: string };
    const result = {} as ReturnType<typeof repo.createEntityWithDefaults<Action>>;
    expectTypeOf(result).toHaveProperty('id');
    expectTypeOf(result).toHaveProperty('entityType');
    expectTypeOf(result).toHaveProperty('label');
    expectTypeOf(result).toHaveProperty('actionFn');
  });

  it('getHostModule("logger") has createLogger returning Logger', () => {
    const loggerMod = {} as HostModuleContracts['logger'];
    expectTypeOf(loggerMod.createLogger).returns.toMatchTypeOf<Logger>();
  });

  it('getHostModule("seed") has generic seedCollection', () => {
    const seedMod = {} as HostModuleContracts['seed'];
    type Item = { name: string; value: number };
    expectTypeOf(seedMod.seedCollection<Item>).toBeFunction();
  });

  it('getHostModule("seed") has generic loadJSON', () => {
    const seedMod = {} as HostModuleContracts['seed'];
    type Config = { items: string[] };
    expectTypeOf(seedMod.loadJSON<Config>).returns
      .toEqualTypeOf<Config | null>();
  });

  it('getHostModule("change-detection") has generic detectChanges', () => {
    const changeMod = {} as HostModuleContracts['change-detection'];
    expectTypeOf(changeMod.detectChanges<{ name: string }>).toBeFunction();
  });

  it('getHostModule("event-emitter") has typed sendToPlugin', () => {
    const emitter = {} as HostModuleContracts['event-emitter'];
    expectTypeOf(emitter.sendToPlugin).parameters
      .toMatchTypeOf<[string, { type: string }]>();
  });

  it('getHostModule("breadcrumb") has generic breadcrumbWithParams', () => {
    const bc = {} as HostModuleContracts['breadcrumb'];
    type Ctx = { selectedId: string };
    expectTypeOf(bc.breadcrumbWithParams<Ctx>).returns
      .toHaveProperty('breadcrumb');
  });

  it('getHostModule("context-menu") has generic contextMenuFn', () => {
    const cm = {} as HostModuleContracts['context-menu'];
    type Ctx = { itemId: string };
    expectTypeOf(cm.contextMenuFn<Ctx>).returns
      .toHaveProperty('contextMenu');
  });

  it('getHostModule("export") has generic stripInternalFields', () => {
    const exp = {} as HostModuleContracts['export'];
    expectTypeOf(exp.stripInternalFields<{ label: string }>).returns
      .toMatchTypeOf<Record<string, unknown>[]>();
  });

  it('getHostModule("query-helpers") has generic findById', () => {
    const qh = {} as HostModuleContracts['query-helpers'];
    type Entity = { name: string };
    expectTypeOf(qh.findById<Entity>).returns
      .toEqualTypeOf<Entity | undefined>();
  });

  it('getHostModule("ears-query") returns QueryBuilder from qx', () => {
    const eq = {} as HostModuleContracts['ears-query'];
    expectTypeOf(eq.qx).returns.toMatchTypeOf<QueryBuilder>();
  });

  it('proxy-passthrough modules accept Record<string, any>', () => {
    expectTypeOf<HostModuleContracts['transaction-helpers']>()
      .toMatchTypeOf<Record<string, any>>();
    expectTypeOf<HostModuleContracts['repository']>()
      .toMatchTypeOf<Record<string, any>>();
    expectTypeOf<HostModuleContracts['services']>()
      .toMatchTypeOf<Record<string, any>>();
  });

  it('getHostModule("paths") functions return string', () => {
    const paths = {} as HostModuleContracts['paths'];
    expectTypeOf(paths.getMediaPath).returns.toBeString();
    expectTypeOf(paths.getLmdbPath).returns.toBeString();
    expectTypeOf(paths.createExportDir).returns.toBeString();
  });

  it('getHostModule("attribute-storage") has typed getAttr', () => {
    const as = {} as HostModuleContracts['attribute-storage'];
    expectTypeOf(as.getAttr).parameters.toMatchTypeOf<[EARS.EntityId, string]>();
  });

  it('getHostModule("lifecycle") has correct shutdown signatures', () => {
    const lc = {} as HostModuleContracts['lifecycle'];
    expectTypeOf(lc.registerShutdownHook).toBeFunction();
    expectTypeOf(lc.runShutdownHooks).returns.toMatchTypeOf<Promise<void>>();
  });

  it('getHostModule("version") has APP_VERSION string', () => {
    const ver = {} as HostModuleContracts['version'];
    expectTypeOf(ver.APP_VERSION).toBeString();
  });
});

// ─── Runtime registration and retrieval ─────────────────────────────
// These tests verify that registerHostModule/getHostModule work at
// runtime with the overloaded signatures.

describe('Host module contracts — runtime', () => {
  const testKey = '__test-module__' as any;

  afterEach(() => {
    try { (getHostModule as any)(testKey); } catch { /* not registered */ }
  });

  it('registerHostModule stores and getHostModule retrieves', () => {
    const mod = { greet: (name: string) => `Hello, ${name}` };
    registerHostModule(testKey, mod);
    const retrieved = getHostModule(testKey);
    expect(retrieved.greet('world')).toBe('Hello, world');
  });

  it('getHostModule throws for unregistered key', () => {
    expect(() => getHostModule('__nonexistent__' as any)).toThrow(
      /not registered/,
    );
  });

  it('registerHostModule accepts a known key with correct shape', () => {
    const fakePaths = {
      getMediaPath: () => '/media',
      getLmdbPath: () => '/lmdb',
      getVolatileLmdbPath: () => '/volatile',
      getSecretsLmdbPath: () => '/secrets',
      createExportDir: (_p: string, _s: string) => '/export/dir',
      ensureDirectoryExists: (_d: string) => {},
    };
    registerHostModule('paths', fakePaths);
    const retrieved = getHostModule('paths');
    expect(retrieved.getMediaPath()).toBe('/media');
    expect(retrieved.createExportDir('/parent', 'system')).toBe('/export/dir');
  });

  it('registerHostModule accepts a known key with extra properties', () => {
    const fakeDisplayName = {
      toDisplayName: (slug: string) => slug.replace(/-/g, ' '),
      extraFn: () => 42,
    };
    registerHostModule('display-name', fakeDisplayName);
    const retrieved = getHostModule('display-name');
    expect(retrieved.toDisplayName('hello-world')).toBe('hello world');
  });

  it('registerHostModule with generic-typed module preserves generics at runtime', () => {
    const store = new Map<string, any>();
    const fakeRepo = {
      findById: <T>(id: string): T | undefined => store.get(id) as T,
      findByIdRaw: <T>(id: string): T | undefined => store.get(id) as T,
      findAll: <T>(_entityType: string): T[] => [...store.values()] as T[],
      findWhere: <T>(_et: string, _f: string, _v: any): T[] => [],
      hasIdCollision: (_id: string) => false,
      createEntityWithDefaults: <T extends Record<string, any>>(
        entityType: string,
        data: Partial<T>,
        prefix?: string,
      ) => {
        const id = `${entityType}-${prefix || 'X'}1` as EARS.EntityId;
        const entity = { ...data, id, entityType } as T & {
          id: EARS.EntityId;
          entityType: EARS.Entity;
        };
        store.set(id, entity);
        return entity;
      },
      updateEntity: (_id: string, _updates: Record<string, any>) => {},
      exists: (id: string) => store.has(id),
      createRelation: () => {},
      RepositoryErrorCode: { NOT_FOUND: 'NOT_FOUND' },
      RepositoryError: class extends Error {
        code: string;
        constructor(msg: string, code = 'UNKNOWN') {
          super(msg);
          this.code = code;
        }
      },
    };

    registerHostModule('shared-repository', fakeRepo);
    const repo = getHostModule('shared-repository');

    type TestEntity = { label: string; value: number };
    const created = repo.createEntityWithDefaults<TestEntity>(
      'Test',
      { label: 'Hello', value: 42 },
      'TST',
    );
    expect(created.id).toMatch(/^Test-/);
    expect(created.label).toBe('Hello');
    expect(created.value).toBe(42);

    const found = repo.findById<TestEntity>(created.id);
    expect(found).toBeDefined();
    expect(found!.label).toBe('Hello');
  });

  it('registerHostModule with seed module preserves generic seedCollection', () => {
    const fakeSeed = {
      registerSeeder: () => {},
      seedData: () => ({}),
      seedCollection: <T>(opts: { getKey: (item: T) => string; file: string; label: string; findExisting: any; create: any; update: any; log: any }) => {
        return { created: 0, updated: 0, skipped: 0 };
      },
      loadJSON: <T>(_path: string): T | null => null,
      shouldSeedAll: () => true,
      filterByInclude: <T>(items: T[]) => items,
    };

    registerHostModule('seed', fakeSeed);
    const seed = getHostModule('seed');

    type Item = { name: string; slug: string };
    const result = seed.seedCollection<Item>({
      file: '/test.json',
      label: 'test',
      getKey: (item) => item.slug,
      findExisting: () => undefined,
      create: () => {},
      update: () => {},
      log: () => {},
    });
    expect(result).toEqual({ created: 0, updated: 0, skipped: 0 });
  });

  it('registerHostModule with logger module returns Logger-compatible object', () => {
    const fakeLogger = {
      createLogger: (source?: string) => ({
        info: (..._args: unknown[]) => {},
        warn: (..._args: unknown[]) => {},
        error: (..._args: unknown[]) => {},
        debug: (..._args: unknown[]) => {},
        source,
      }),
      LogEvent: { INFO: 'info', ERROR: 'error' },
    };

    registerHostModule('logger', fakeLogger);
    const loggerMod = getHostModule('logger');
    const logger = loggerMod.createLogger('test');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.debug).toBe('function');
  });
});

// ─── Contract coverage ──────────────────────────────────────────────
// Verify that all module keys registered in sdk-host-init.ts
// have corresponding contracts.

describe('Host module contracts — coverage', () => {
  const REGISTERED_KEYS: HostModuleKey[] = [
    'repository', 'shared-repository', 'query-helpers',
    'transaction-helpers', 'attribute-storage', 'edge-store',
    'relation-index', 'ears-graph', 'entity-utils', 'ears-query',
    'lmdb-query', 'hydrate-sharded', 'logger', 'trpc',
    'bus-emitter', 'router-events', 'paths', 'media', 'export',
    'resolve-cli', 'random-id',
    'binary-operator', 'change-detection', 'display-name',
    'system-errors', 'seed', 'lifecycle', 'event-emitter', 'version',
  ];

  it('every registered key is a valid HostModuleKey', () => {
    for (const key of REGISTERED_KEYS) {
      expectTypeOf(key).toMatchTypeOf<HostModuleKey>();
    }
  });

  it('FE module keys are valid HostModuleKeys', () => {
    const FE_KEYS: HostModuleKey[] = [
      'breadcrumb', 'fe-safe-events', 'route-trailer',
      'context-menu', 'navigate', 'nav-history', 'hotkeys',
      'tab-groups', 'open-in-app-browser', 'settings-save-status',
      'plugins',
    ];
    for (const key of FE_KEYS) {
      expectTypeOf(key).toMatchTypeOf<HostModuleKey>();
    }
  });

  it('service module keys are valid HostModuleKeys', () => {
    const SERVICE_KEYS: HostModuleKey[] = [
      'event-emitter', 'services',
    ];
    for (const key of SERVICE_KEYS) {
      expectTypeOf(key).toMatchTypeOf<HostModuleKey>();
    }
  });

  it('infrastructure module keys are valid HostModuleKeys', () => {
    const INFRA_KEYS: HostModuleKey[] = [
      'logger', 'trpc', 'bus-emitter', 'router-events',
      'version', 'migrations',
    ];
    for (const key of INFRA_KEYS) {
      expectTypeOf(key).toMatchTypeOf<HostModuleKey>();
    }
  });
});
