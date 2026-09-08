/**
 * Tests for the registry modules that wire default-setup features
 * into the api core without direct cross-package imports.
 */

describe('core/lifecycle — shutdown hooks', () => {
  it('runShutdownHooks calls all registered hooks', async () => {
    const { registerShutdownHook, runShutdownHooks } = await import('@abuddy/sdk/utils');

    const calls: string[] = [];
    registerShutdownHook(() => calls.push('hook-a'));
    registerShutdownHook(() => calls.push('hook-b'));

    runShutdownHooks();

    expect(calls).toContain('hook-a');
    expect(calls).toContain('hook-b');
  });

  it('swallows errors from individual hooks without stopping others', async () => {
    const { registerShutdownHook, runShutdownHooks } = await import('@abuddy/sdk/utils');

    const calls: string[] = [];
    registerShutdownHook(() => { throw new Error('boom'); });
    registerShutdownHook(() => calls.push('after-error'));

    runShutdownHooks();

    expect(calls).toContain('after-error');
  });
});

describe('boot exports — source modules', () => {
  it('exports logsEntry (early boot system)', async () => {
    const { logsEntry } = await import('../../src/features/logs/be/system');

    expect(logsEntry).toBeDefined();
    expect(typeof logsEntry.machine.id).toBe('string');
  });

  it('exports createDefaultSettings as a function', async () => {
    const { createDefaultSettings } = await import('../../src/features/settings/be/repository');

    expect(typeof createDefaultSettings).toBe('function');
  });
});

describe('registries/services — feature services assembly', () => {
  it('exports featureServices with all expected service keys', async () => {
    const { featureServices } = await import('../../src/__generated__/services');

    const expectedKeys = [
      'llm', 'database', 'prompt', 'action', 'library', 'browser',
      'settings', 'textStream', 'chat', 'artifact', 'brain',
      'cli', 'filesystem', 'threads', 'codex', 'modelClient', 'openaiAuth',
    ];

    for (const key of expectedKeys) {
      expect(featureServices).toHaveProperty(key);
    }
  });

  it('does not include core services (logger, emitter, repository)', async () => {
    const { featureServices } = await import('../../src/__generated__/services');

    expect(featureServices).not.toHaveProperty('logger');
    expect(featureServices).not.toHaveProperty('emitter');
    expect(featureServices).not.toHaveProperty('repository');
  });
});

describe('core/seed — seeder registry', () => {
  it('seedData runs registered seeders and returns keyed counts', async () => {
    const { registerSeeder, seedData } = await import('@abuddy/sdk/utils');
    const os = await import('os');
    const path = await import('path');

    registerSeeder({
      key: 'test-artifact',
      seed(ctx) {
        return { created: 2, updated: 1, skipped: 0 };
      },
    });

    const result = seedData({ compiledDir: path.join(os.tmpdir(), 'nonexistent') });

    expect(result['test-artifact']).toEqual({ created: 2, updated: 1, skipped: 0 });
  });

  it('skips seeders whose include set is empty', async () => {
    const { registerSeeder, seedData } = await import('@abuddy/sdk/utils');
    const os = await import('os');
    const path = await import('path');

    let called = false;
    registerSeeder({
      key: 'skip-me',
      seed() {
        called = true;
        return { created: 0, updated: 0, skipped: 0 };
      },
    });

    seedData({
      compiledDir: path.join(os.tmpdir(), 'nonexistent'),
      include: { 'skip-me': new Set() },
    });

    expect(called).toBe(false);
  });

  it('rejects duplicate seeder keys', async () => {
    const { registerSeeder } = await import('@abuddy/sdk/utils');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    registerSeeder({ key: 'dup-test', seed: () => ({ created: 0, updated: 0, skipped: 0 }) });
    registerSeeder({ key: 'dup-test', seed: () => ({ created: 0, updated: 0, skipped: 0 }) });

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Duplicate seeder key'));
    warn.mockRestore();
  });

  it('default-setup registers all built-in seeders', async () => {
    await import('../../src/registries/seed');
    const { seedData } = await import('@abuddy/sdk/utils');
    const os = await import('os');
    const path = await import('path');

    const result = seedData({ compiledDir: path.join(os.tmpdir(), 'empty-dir-' + Date.now()) });

    const keys = Object.keys(result);
    expect(keys).toContain('actions');
    expect(keys).toContain('prompts');
    expect(keys).toContain('flows');
    expect(keys).toContain('library');
    expect(keys).toContain('notes');
    expect(keys).toContain('settings');
  });

  it('exports preview function', async () => {
    const { previewSetupPack } = await import('../../src/registries/seed/preview');

    expect(typeof previewSetupPack).toBe('function');
  });
});
