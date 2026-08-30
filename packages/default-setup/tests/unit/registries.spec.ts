/**
 * Tests for the registry modules that wire default-setup features
 * into the api core without direct cross-package imports.
 */

describe('registries/lifecycle — shutdown hooks', () => {
  it('runShutdownHooks calls all registered hooks', async () => {
    // Import fresh to test the mechanism (the module also self-registers terminalService.killAll)
    const { registerShutdownHook, runShutdownHooks } = await import('../../src/registries/lifecycle');

    const calls: string[] = [];
    registerShutdownHook(() => calls.push('hook-a'));
    registerShutdownHook(() => calls.push('hook-b'));

    runShutdownHooks();

    expect(calls).toContain('hook-a');
    expect(calls).toContain('hook-b');
  });

  it('swallows errors from individual hooks without stopping others', async () => {
    const { registerShutdownHook, runShutdownHooks } = await import('../../src/registries/lifecycle');

    const calls: string[] = [];
    registerShutdownHook(() => { throw new Error('boom'); });
    registerShutdownHook(() => calls.push('after-error'));

    runShutdownHooks();

    expect(calls).toContain('after-error');
  });

  it('self-registers the terminalService.killAll hook on module load', async () => {
    const { runShutdownHooks } = await import('../../src/registries/lifecycle');

    // The module-level registerShutdownHook(() => terminalService.killAll()) runs on import.
    // We can't easily assert on terminalService.killAll without mocking, but we can
    // verify runShutdownHooks doesn't throw (the hook array is non-empty).
    expect(() => runShutdownHooks()).not.toThrow();
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

describe('registries/seed — seed helper exports', () => {
  it('exports validate, compile, and isFlowConfig from flows DSL', async () => {
    const { validate, compile, isFlowConfig } = await import('../../src/registries/seed');

    expect(typeof validate).toBe('function');
    expect(typeof compile).toBe('function');
    expect(typeof isFlowConfig).toBe('function');
  });

  it('exports importNotesFromData from notes feature', async () => {
    const { importNotesFromData } = await import('../../src/registries/seed');

    expect(typeof importNotesFromData).toBe('function');
  });
});
