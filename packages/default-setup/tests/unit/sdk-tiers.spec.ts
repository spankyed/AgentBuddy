/**
 * Tests verifying that default-setup imports from @abuddy/sdk and @abuddy/ears resolve to the
 * runtime the harness binds.
 */
import {
  tx, repository, registerRepository, exists,
  RepositoryError, RepositoryErrorCode,
} from '@abuddy/ears';
import {
  qx, createEntity, findById, findByIdRaw, findAll, findWhere,
  createEntityWithDefaults, updateEntity, getAttr,
} from '../../src/__generated__/ears';
import { resetTestData } from '@abuddy/sdk/testing';
import { EARS } from '../../src/__generated__/ears';

describe('Tier 1 — EARS delegates', () => {
  beforeEach(() => resetTestData());

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
    expect((repository.sdkTestQueries as typeof testQueries).list()).toBe('ok');
  });

  it('getAttr reads stored attributes', () => {
    const id = tx(EARS.Entity.Action as any)
      .put('color', 'blue')
      .id();
    const color = getAttr(id, 'color');
    expect(color).toBe('blue');
  });

  it('resetTestData resets all state', () => {
    createEntityWithDefaults(
      EARS.Entity.Action as any,
      { label: 'Temp', actionFn: 'fn()' } as any,
      'ACT',
    );
    expect(findAll(EARS.Entity.Action as any).length).toBe(1);
    resetTestData();
    expect(findAll(EARS.Entity.Action as any).length).toBe(0);
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

  it('safeEvents is callable', async () => {
    const { safeEvents } = await import('@abuddy/sdk/helpers');
    expect(typeof safeEvents).toBe('function');
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

  it('getAppVersion reads the host version', async () => {
    const { getAppVersion } = await import('@abuddy/sdk/env');
    expect(getAppVersion()).toBe('0.0.0-test');
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

  it('seed helpers are callable', async () => {
    const { seedData, loadJSON } = await import('@abuddy/sdk/utils');
    expect(typeof seedData).toBe('function');
    expect(typeof loadJSON).toBe('function');
  });
});

describe('Tier 7 — Event delegates', () => {
  it('sendToPlugin and sendToSystem are callable', async () => {
    const { sendToPlugin, sendToSystem } = await import('@abuddy/sdk/events');
    expect(typeof sendToPlugin).toBe('function');
    expect(typeof sendToSystem).toBe('function');
  });
});

describe('Import isolation — no remaining @/core/* imports in .ts', () => {
  it('default-setup .ts files do not import from @/core/* (excluding FE components, migrations, type imports)', async () => {
    const { execSync } = await import('child_process');
    const result = execSync(
      // The alias is spelled in two parts so the pack-test import guard doesn't read this command as an import
      `grep -rn "from '@/${'core'}/" ../../src/ --include='*.ts' 2>/dev/null | grep -v "@abuddy" | grep -v "@/core/components" | grep -v "migrations/" | grep -v "import type" || true`,
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
