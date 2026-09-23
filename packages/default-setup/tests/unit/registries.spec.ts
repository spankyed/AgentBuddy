/**
 * Tests for the registry modules that wire default-setup features
 * into the api core without direct cross-package imports.
 */

describe('boot exports — source modules', () => {
  it('default-exports the logs entry (early boot system)', async () => {
    // System modules default-export their SystemEntry, the same way plugin
    // modules default-export their Plugin.
    const { default: logsEntry } = await import('../../src/features/logs/be/system');

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
      'database', 'prompt', 'action', 'library',
      'chat', 'artifact', 'brain',
      'cli', 'threads', 'codex',
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

describe('core/seed — seeders', () => {
  it("default-setup's registration carries all built-in seeders, which seedData runs for its compiled seeds", async () => {
    const { seedData } = await import('@abuddy/sdk/utils');
    const fs = await import('fs');
    const os = await import('os');
    const path = await import('path');

    // A compiled seeds directory of default-setup's with no seed files: every seeder runs and finds nothing
    const compiledDir = fs.mkdtempSync(path.join(os.tmpdir(), 'default-setup-seeds-'));
    fs.writeFileSync(path.join(compiledDir, 'seeds.json'), JSON.stringify({ version: 1, packId: 'default-setup', seeds: [] }));
    const result = seedData({ compiledDir });
    fs.rmSync(compiledDir, { recursive: true, force: true });

    const keys = Object.keys(result);
    expect(keys).toContain('actions');
    expect(keys).toContain('prompts');
    expect(keys).toContain('flows');
    expect(keys).toContain('library');
    expect(keys).toContain('notes');
    expect(keys).toContain('settings');
  });

  it('exports preview function', async () => {
    const { previewPackSeeds } = await import('@abuddy/sdk/seed');

    expect(typeof previewPackSeeds).toBe('function');
  });
});
