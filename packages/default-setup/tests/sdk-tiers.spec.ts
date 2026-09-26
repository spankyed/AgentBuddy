/**
 * Tests verifying that default-setup imports from @abuddy/sdk and @abuddy/ears resolve to the
 * runtime the harness binds.
 */
import { untypedTx, exists } from '@abuddy/ears';
import {
  findById, findByIdRaw, findAll, findWhere,
  createEntityWithDefaults, updateEntity, getAttr,
} from '@/__generated__/ears';
import { resetTestData } from '@abuddy/sdk/testing';
import { EARS } from '@/__generated__/ears';

describe('Tier 1 — EARS delegates', () => {
  beforeEach(() => resetTestData());

  it('tx creates and retrieves an entity', () => {
    const id = untypedTx(EARS.Entity.Action as any)
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

  it('safeEvents is exported', async () => {
    const { safeEvents } = await import('@abuddy/sdk/helpers');
    expect(typeof safeEvents).toBe('function');
  });

  it('the id grammar is exported', async () => {
    const { FEATURE_ID_PATTERN, PACK_ID_PATTERN } = await import('@abuddy/sdk/ids');
    expect(PACK_ID_PATTERN.test('default-setup')).toBe(true);
    expect(FEATURE_ID_PATTERN.test('notes')).toBe(true);
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

describe('Tier 5 — Templates and app info', () => {
  it('executeTemplate runs a prompt function body with its params', async () => {
    const { executeTemplate } = await import('@abuddy/sdk/templates');
    expect(executeTemplate('return `Hi ${params.name}`', { name: 'Ada' })).toBe('Hi Ada');
  });

});

describe('Tier 6 — Utility delegates', () => {
  it('path utilities are callable', async () => {
    const { createExportDir, ensureDirectoryExists, getDataDirPath } = await import('@abuddy/sdk/utils');
    expect(typeof createExportDir).toBe('function');
    expect(typeof ensureDirectoryExists).toBe('function');
    expect(typeof getDataDirPath).toBe('function');
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

  it('randomId is callable', async () => {
    const { randomId } = await import('@abuddy/sdk/utils');
    expect(typeof randomId).toBe('function');
  });

  it('BinaryOperator is accessible', async () => {
    const { BinaryOperator } = await import('@abuddy/sdk/utils');
    expect(BinaryOperator).toBeDefined();
  });

});
