/**
 * Tests verifying that default-setup imports from @abuddy/sdk delegates
 * resolve correctly through the host module registry.
 */
import { registerHostModule, getHostModule } from '@abuddy/sdk/runtime';
import {
  qx, tx, createEntity,
  repository, registerRepository,
  findById, findByIdRaw, findAll, findWhere,
  createEntityWithDefaults, updateEntity, exists,
  RepositoryError, RepositoryErrorCode,
  queryHelpers, transactionHelpers,
  getAttr, clearMemory,
  edgeStore, relationIndex,
} from '@abuddy/sdk/ears';
import { EARS } from '../../src/registries/ears';

describe('SDK runtime — host module registry', () => {
  it('registerHostModule stores and getHostModule retrieves', () => {
    const mod = { hello: () => 'world' };
    registerHostModule('test-mod', mod);
    expect(getHostModule('test-mod')).toBe(mod);
  });

  it('getHostModule throws for unregistered module', () => {
    expect(() => getHostModule('nonexistent-mod')).toThrow(/not registered/);
  });
});

describe('Tier 1 — EARS delegates', () => {
  beforeEach(() => clearMemory());

  it('qx and tx are callable functions', () => {
    expect(typeof qx).toBe('function');
    expect(typeof tx).toBe('function');
  });

  it('createEntity produces a valid entity ID', () => {
    const id = createEntity(EARS.Entity.Action as any);
    expect(id).toMatch(/^Action-/);
  });

  it('tx creates and retrieves an entity', () => {
    const id = tx(EARS.Entity.Action as any)
      .put('label', 'test-action')
      .id();
    expect(id).toBeDefined();
    expect(id).toMatch(/^Action-/);

    const label = getAttr(id, 'label');
    expect(label).toBe('test-action');
  });

  it('createEntityWithDefaults produces a complete entity', () => {
    const entity = createEntityWithDefaults(
      EARS.Entity.Action as any,
      { label: 'SDK Test', actionFn: 'noop()' } as any,
      'ACT',
    );
    expect(entity.id).toMatch(/^Action-/);
    expect(entity.label).toBe('SDK Test');
    expect(entity.shortCode).toMatch(/^ACT-/);
    expect(entity.createdAt).toBeTypeOf('number');
  });

  it('findById / findAll / findWhere round-trip', () => {
    const entity = createEntityWithDefaults(
      EARS.Entity.Action as any,
      { label: 'Findable', actionFn: 'fn()', category: 'test' } as any,
      'ACT',
    );

    expect(findById(entity.id)).toBeDefined();
    expect(findAll(EARS.Entity.Action as any).length).toBe(1);
    expect(findWhere(EARS.Entity.Action as any, 'category', 'test').length).toBe(1);
  });

  it('findByIdRaw returns entity including after soft-delete', () => {
    const entity = createEntityWithDefaults(
      EARS.Entity.Action as any,
      { label: 'ToDelete', actionFn: 'fn()' } as any,
      'ACT',
    );
    updateEntity(entity.id, { deleted: true });

    const raw = findByIdRaw(entity.id);
    expect(raw).toBeDefined();
    expect((raw as any).deleted).toBe(true);
  });

  it('exists returns true for existing entities', () => {
    const entity = createEntityWithDefaults(
      EARS.Entity.Action as any,
      { label: 'Exists', actionFn: 'fn()' } as any,
      'ACT',
    );
    expect(exists(entity.id)).toBe(true);
    expect(exists('Action-nonexistent' as any)).toBe(false);
  });

  it('RepositoryError is constructable and instanceof Error', () => {
    const err = new RepositoryError('test msg', RepositoryErrorCode.VALIDATION_ERROR);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('test msg');
  });

  it('RepositoryErrorCode has expected values', () => {
    expect(RepositoryErrorCode.VALIDATION_ERROR).toBeDefined();
    expect(RepositoryErrorCode.NOT_FOUND).toBeDefined();
  });

  it('repository proxy delegates registerRepository', () => {
    const testQueries = { list: () => 'ok' };
    registerRepository('sdkTestQueries', testQueries);
    expect(repository.sdkTestQueries.list()).toBe('ok');
  });

  it('queryHelpers provides findById/findAll/findWhere', () => {
    expect(typeof queryHelpers.findById).toBe('function');
    expect(typeof queryHelpers.findAll).toBe('function');
    expect(typeof queryHelpers.findWhere).toBe('function');
  });

  it('getAttr reads stored attributes', () => {
    const id = tx(EARS.Entity.Action as any)
      .put('color', 'blue')
      .id();
    const color = getAttr(id, 'color');
    expect(color).toBe('blue');
  });

  it('clearMemory resets all state', () => {
    createEntityWithDefaults(
      EARS.Entity.Action as any,
      { label: 'Temp', actionFn: 'fn()' } as any,
      'ACT',
    );
    expect(findAll(EARS.Entity.Action as any).length).toBe(1);
    clearMemory();
    expect(findAll(EARS.Entity.Action as any).length).toBe(0);
  });

  it('edgeStore is accessible', () => {
    expect(edgeStore).toBeDefined();
  });

  it('relationIndex is accessible', () => {
    expect(relationIndex).toBeDefined();
  });
});

describe('Tier 2 — EARS types', () => {
  it('SDK EARS namespace exports core Entity and helpers', async () => {
    const { EARS: sdkEARS } = await import('@abuddy/sdk/types');
    expect(sdkEARS.Entity).toBeDefined();
    expect(sdkEARS.Entity.Relation).toBe('Relation');
    expect(typeof sdkEARS.AttrKind.Custom).toBe('function');
    expect(typeof sdkEARS.RelKind.Custom).toBe('function');
  });

  it('generated EARS registry has domain entities', () => {
    expect(EARS.Entity.Action).toBe('Action');
    expect(EARS.Entity.Thread).toBe('Thread');
    expect(EARS.Entity.Flow).toBe('Flow');
  });
});

describe('Tier 3 — System Framework delegates', () => {
  it('defineSystem is callable', async () => {
    const { defineSystem } = await import('@abuddy/sdk/framework');
    expect(typeof defineSystem).toBe('function');
  });

  it('emit and safeEvents are callable', async () => {
    const { emit, safeEvents } = await import('@abuddy/sdk/helpers');
    expect(typeof emit).toBe('function');
    expect(typeof safeEvents).toBe('function');
  });

  it('emit wraps event for bus with OUTGOING type', async () => {
    const { emit } = await import('@abuddy/sdk/helpers');
    const wrapped = emit('test-plugin', { type: 'HELLO' });
    expect(wrapped.type).toBe('OUTGOING');
    expect(wrapped.event.pluginId).toBe('test-plugin');
    expect(wrapped.event.type).toBe('HELLO');
  });

  it('getActor, sendParentSafe, getBus are exported', async () => {
    const { getActor, sendParentSafe, getBus } = await import('@abuddy/sdk/helpers');
    expect(typeof getActor).toBe('function');
    expect(typeof sendParentSafe).toBe('function');
    expect(typeof getBus).toBe('function');
  });

  it('bus constant is exported', async () => {
    const { bus } = await import('@abuddy/sdk/ids');
    expect(bus).toBe('bus');
  });
});

describe('Tier 4 — Logger delegate', () => {
  it('createLogger returns a logger with standard methods', async () => {
    const { createLogger } = await import('@abuddy/sdk/logger');
    const logger = createLogger('test-logger');
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
  });
});

describe('Tier 5 — RPC delegates', () => {
  it('rootEvents is accessible', async () => {
    const { rootEvents } = await import('@abuddy/sdk/rpc');
    expect(rootEvents).toBeDefined();
  });

  it('trpc proxy is accessible', async () => {
    const { trpc } = await import('@abuddy/sdk/rpc');
    expect(trpc).toBeDefined();
  });
});

describe('Tier 6 — Utility delegates', () => {
  it('path utilities are callable', async () => {
    const { createExportDir, ensureDirectoryExists, getMediaPath } = await import('@abuddy/sdk/utils');
    expect(typeof createExportDir).toBe('function');
    expect(typeof ensureDirectoryExists).toBe('function');
    expect(typeof getMediaPath).toBe('function');
  });

  it('media utilities are callable', async () => {
    const { extractMediaRefs, copyMediaByRef, restoreJsonMediaRefs } = await import('@abuddy/sdk/utils');
    expect(typeof extractMediaRefs).toBe('function');
    expect(typeof copyMediaByRef).toBe('function');
    expect(typeof restoreJsonMediaRefs).toBe('function');
  });

  it('export utilities are callable', async () => {
    const { writeExportJson, stripInternalFields, toSlug } = await import('@abuddy/sdk/utils');
    expect(typeof writeExportJson).toBe('function');
    expect(typeof stripInternalFields).toBe('function');
    expect(typeof toSlug).toBe('function');
  });

  it('resolve-cli utilities are callable', async () => {
    const { resolveForService, testCli, isCliName } = await import('@abuddy/sdk/utils');
    expect(typeof resolveForService).toBe('function');
    expect(typeof testCli).toBe('function');
    expect(typeof isCliName).toBe('function');
  });

  it('randomId is callable', async () => {
    const { randomId } = await import('@abuddy/sdk/utils');
    expect(typeof randomId).toBe('function');
  });

  it('BinaryOperator is accessible', async () => {
    const { BinaryOperator } = await import('@abuddy/sdk/utils');
    expect(BinaryOperator).toBeDefined();
  });

  it('seed helpers are callable', async () => {
    const { registerSeeder, seedData, loadJSON } = await import('@abuddy/sdk/utils');
    expect(typeof registerSeeder).toBe('function');
    expect(typeof seedData).toBe('function');
    expect(typeof loadJSON).toBe('function');
  });

  it('lifecycle helpers are callable', async () => {
    const { registerShutdownHook, runShutdownHooks } = await import('@abuddy/sdk/utils');
    expect(typeof registerShutdownHook).toBe('function');
    expect(typeof runShutdownHooks).toBe('function');
  });
});

describe('Tier 7 — Service delegates', () => {
  it('sendToPlugin and sendToBrainSystem are callable', async () => {
    const { sendToPlugin, sendToBrainSystem } = await import('@abuddy/sdk/services');
    expect(typeof sendToPlugin).toBe('function');
    expect(typeof sendToBrainSystem).toBe('function');
  });
});

describe('Import isolation — no remaining @/core/* imports in .ts', () => {
  it('default-setup .ts files do not import from @/core/* (excluding FE components, migrations, type imports)', async () => {
    const { execSync } = await import('child_process');
    const result = execSync(
      `grep -rn "from '@/core/" ../../src/ --include='*.ts' 2>/dev/null | grep -v "@abuddy" | grep -v "@/core/components" | grep -v "migrations/" | grep -v "import type" || true`,
      { encoding: 'utf-8', cwd: __dirname }
    ).trim();
    expect(result).toBe('');
  });

  it('default-setup .ts files do not import from @/repository (excluding migrations)', async () => {
    const { execSync } = await import('child_process');
    const result = execSync(
      `grep -rn "from '@/repository'" ../../src/ --include='*.ts' 2>/dev/null | grep -v "migrations/" || true`,
      { encoding: 'utf-8', cwd: __dirname }
    ).trim();
    expect(result).toBe('');
  });

  it('default-setup .ts files do not import from @/services/*', async () => {
    const { execSync } = await import('child_process');
    const result = execSync(
      `grep -rn "from '@/services" ../../src/ --include='*.ts' 2>/dev/null || true`,
      { encoding: 'utf-8', cwd: __dirname }
    ).trim();
    expect(result).toBe('');
  });
});
