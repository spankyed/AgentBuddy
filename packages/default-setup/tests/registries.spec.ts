/**
 * Tests for the registry modules that wire default-setup features
 * into the api core without direct cross-package imports.
 */

describe('boot exports — source modules', () => {
  it('default-exports the logs entry (early boot system)', async () => {
    // System modules default-export their SystemEntry, the same way plugin
    // modules default-export their Plugin.
    const { default: logsEntry } = await import('#features/logs/be/system.ts');

    expect(logsEntry).toBeDefined();
    expect(typeof logsEntry.machine.id).toBe('string');
  });
});

describe('registries/services — feature services assembly', () => {
  it('does not include core services (logger, emitter, repository)', async () => {
    const { featureServices } = await import('#generated/services.ts');

    expect(featureServices).not.toHaveProperty('logger');
    expect(featureServices).not.toHaveProperty('emitter');
    expect(featureServices).not.toHaveProperty('repository');
  });
});

describe('core/seed — appliers', () => {
  it("default-setup's registration carries all built-in appliers, which importCompiledContent runs for its compiled seeds", async () => {
    const { importCompiledContent } = await import('@abuddy/sdk/utils');
    const fs = await import('fs');
    const os = await import('os');
    const path = await import('path');

    // A compiled seeds directory of default-setup's with no seed files: every applier runs and finds nothing
    const compiledDir = fs.mkdtempSync(path.join(os.tmpdir(), 'default-setup-seeds-'));
    fs.writeFileSync(path.join(compiledDir, 'seeds.json'), JSON.stringify({ version: 1, packId: 'default-setup', seeds: [] }));
    const result = importCompiledContent({ compiledDir });
    fs.rmSync(compiledDir, { recursive: true, force: true });

    const keys = Object.keys(result);
    expect(keys).toContain('actions');
    expect(keys).toContain('prompts');
    expect(keys).toContain('flows');
    expect(keys).toContain('library');
    expect(keys).toContain('notes');
    // No `settings` applier: the app's default settings are this pack's own source, imported by
    // `src/app-settings/`, and nothing about settings is written to the database by seeding
    expect(keys).not.toContain('settings');
  });

  it('exports preview function', async () => {
    const { previewPackContent } = await import('@abuddy/sdk/content');

    expect(typeof previewPackContent).toBe('function');
  });
});
