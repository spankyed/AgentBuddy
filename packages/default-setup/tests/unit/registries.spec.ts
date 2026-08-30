/**
 * Tests for the registry modules that wire default-setup features
 * into the api core without direct cross-package imports.
 */

describe('core/lifecycle — shutdown hooks', () => {
  it('runShutdownHooks calls all registered hooks', async () => {
    const { registerShutdownHook, runShutdownHooks } = await import('@/core/shared/lifecycle');

    const calls: string[] = [];
    registerShutdownHook(() => calls.push('hook-a'));
    registerShutdownHook(() => calls.push('hook-b'));

    runShutdownHooks();

    expect(calls).toContain('hook-a');
    expect(calls).toContain('hook-b');
  });

  it('swallows errors from individual hooks without stopping others', async () => {
    const { registerShutdownHook, runShutdownHooks } = await import('@/core/shared/lifecycle');

    const calls: string[] = [];
    registerShutdownHook(() => { throw new Error('boom'); });
    registerShutdownHook(() => calls.push('after-error'));

    runShutdownHooks();

    expect(calls).toContain('after-error');
  });
});

describe('registries/boot — early boot exports', () => {
  it('exports earlyBootSystem (logs system machine)', async () => {
    const { earlyBootSystem } = await import('../../src/registries/boot');

    expect(earlyBootSystem).toBeDefined();
    // XState machines have an id and events property
    expect(typeof earlyBootSystem.id).toBe('string');
  });

  it('exports createDefaultSettings as a function', async () => {
    const { createDefaultSettings } = await import('../../src/registries/boot');

    expect(typeof createDefaultSettings).toBe('function');
  });
});

describe('registries/services — feature services assembly', () => {
  it('exports featureServices with all expected service keys', async () => {
    const { featureServices } = await import('../../src/registries/services');

    const expectedKeys = [
      'llm', 'database', 'prompt', 'action', 'library', 'browser',
      'settings', 'textStream', 'chat', 'artifact', 'brain', 'media',
      'cli', 'filesystem', 'threads', 'codex', 'modelClient', 'openaiAuth',
    ];

    for (const key of expectedKeys) {
      expect(featureServices).toHaveProperty(key);
    }
  });

  it('does not include core services (logger, emitter, repository)', async () => {
    const { featureServices } = await import('../../src/registries/services');

    expect(featureServices).not.toHaveProperty('logger');
    expect(featureServices).not.toHaveProperty('emitter');
    expect(featureServices).not.toHaveProperty('repository');
  });
});

describe('registries/seed — seed logic exports', () => {
  it('exports seedData and runBootSeed functions', async () => {
    const { seedData, runBootSeed } = await import('../../src/registries/seed');

    expect(typeof seedData).toBe('function');
    expect(typeof runBootSeed).toBe('function');
  });

  it('exports loadJSON utility', async () => {
    const { loadJSON } = await import('../../src/registries/seed');

    expect(typeof loadJSON).toBe('function');
  });

  it('exports preview types and function', async () => {
    const { previewSetupPack } = await import('../../src/registries/seed/preview');

    expect(typeof previewSetupPack).toBe('function');
  });
});
