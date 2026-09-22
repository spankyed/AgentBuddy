// A plugin's settings are stored under its ref, `<packId>/<featureId>`, and nothing else is stored there. A name
// that reaches the store unresolved throws rather than writing a slice no reader looks at.
import { describe, expect, it } from 'vitest';
import { startApp } from '@abuddy/testing/harness';
import { repository } from '@/__generated__/repository';
import { services } from '@/__generated__/services';
import { ref } from '@/__generated__/ref';

const stored = () => repository.settingsQueries.getStoredSettings().plugins as Record<string, any>;

describe('the plugin settings keys', () => {
  it("takes a plugin's ref", async () => {
    await startApp({ systems: [] });

    repository.settingsCommands.updateSettings('plugin', ref('threads'), ['sort'], 'oldest');

    expect(stored()).toEqual({ 'default-setup/threads': { sort: 'oldest' } });
  });

  it('refuses a name, and writes nothing', async () => {
    await startApp({ systems: [] });

    expect(() => repository.settingsCommands.updateSettings('plugin', 'threads', ['sort'], 'oldest'))
      .toThrow(`"threads" isn't a plugin settings key`);
    expect(stored()).toBeUndefined();
  });

  // Read and written by the same key: a name would be read in the settings plugin's pack, whoever asked
  it('refuses a name when reading too', async () => {
    await startApp({ systems: [] });

    // @ts-expect-error a plugin's settings are keyed by its ref
    expect(() => repository.settingsQueries.getPluginSettings('threads')).toThrow(`"threads" isn't a plugin settings key`);
  });
});

// Dependent packs and actions reach the settings through services.settings. Resolving a bare name there would read
// and write the settings plugin's own pack's slice, whoever called: another pack's `memos` would land at
// `default-setup/memos`. So it takes the ref and refuses a name.
describe('services.settings', () => {
  it("reads and writes another pack's plugin at its ref", async () => {
    await startApp({ systems: [] });

    services.settings.updatePluginSetting('memo-pack/memos', ['sort'], 'oldest');

    expect(stored()).toEqual({ 'memo-pack/memos': { sort: 'oldest' } });
    expect(services.settings.getPluginSettings('memo-pack/memos')).toEqual({ sort: 'oldest' });
  });

  it('refuses a bare name, and writes nothing', async () => {
    await startApp({ systems: [] });

    // @ts-expect-error a plugin's settings are keyed by its ref
    expect(() => services.settings.updatePluginSetting('memos', ['sort'], 'oldest')).toThrow(`"memos" isn't a plugin settings key`);
    // @ts-expect-error a plugin's settings are keyed by its ref
    expect(() => services.settings.getPluginSettings('memos')).toThrow(`"memos" isn't a plugin settings key`);
    expect(stored()).toBeUndefined();
  });
});


