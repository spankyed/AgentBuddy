// A plugin's settings are stored under its ref, `<packId>/<featureId>`, and nothing else is stored there.
// Settings replaced wholesale (the settings editor, an export pasted back) may come from before 0.3.15, when they
// were stored under feature ids, with the app shell's state in `_meta`: the slices land under refs and the shell's
// state, which is the host's now, is dropped. A name that reaches the store unresolved throws rather than writing
// a slice no reader looks at.
import { describe, expect, it } from 'vitest';
import { startApp } from '@abuddy/testing/harness';
import { repository } from '@/__generated__/repository';
import { pluginSettingsKey } from '@/features/settings/plugin-settings';

const stored = () => repository.settingsQueries.getStoredSettings().plugins as Record<string, any>;

describe('replacing the settings', () => {
  it("lands settings exported before 0.3.15 under their plugins' refs, without the shell's state", async () => {
    const app = await startApp({ systems: ['settings'] });
    await app.connect();

    await app.send('settings', {
      type: 'REPLACE_SETTINGS',
      data: {
        general: {},
        plugins: {
          threads: { sort: 'oldest' },
          _meta: { visibility: { browser: false }, lastActivePlugin: 'notes' },
        },
      },
    });

    expect(stored()).toEqual({ 'default-setup/threads': { sort: 'oldest' } });
    expect(repository.settingsQueries.getPluginSettings('threads')).toMatchObject({ sort: 'oldest' });
  });
});

describe('the plugin settings keys', () => {
  it("takes a plugin's ref", async () => {
    await startApp({ systems: [] });

    repository.settingsCommands.updateSettings('plugin', pluginSettingsKey('threads'), ['sort'], 'oldest');

    expect(stored()).toEqual({ 'default-setup/threads': { sort: 'oldest' } });
  });

  it('refuses the app shell\'s old `_meta` key', async () => {
    await startApp({ systems: [] });

    expect(() => repository.settingsCommands.updateSettings('plugin', '_meta', ['visibility'], {}))
      .toThrow(`"_meta" isn't a plugin settings key`);
  });

  it('refuses a name, and writes nothing', async () => {
    await startApp({ systems: [] });

    expect(() => repository.settingsCommands.updateSettings('plugin', 'threads', ['sort'], 'oldest'))
      .toThrow(`"threads" isn't a plugin settings key`);
    expect(stored()).toBeUndefined();
  });
});
