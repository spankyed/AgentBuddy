// A plugin's settings are stored under its address, `<packId>/<featureId>`, and the app's metadata under `_meta`.
// Settings replaced wholesale (the settings editor, an export pasted back) may come from before 0.3.15, when they
// were stored under feature ids: those land addressed. Nothing else is a key, so a name that reaches the store
// unresolved throws rather than writing a slice no reader looks at.
import { describe, expect, it } from 'vitest';
import { startApp } from '@abuddy/testing/harness';
import { repository } from '@/__generated__/repository';
import { pluginSettingsKey } from '@/features/settings/plugin-settings';

const stored = () => repository.settingsQueries.getStoredSettings().plugins as Record<string, any>;

describe('replacing the settings', () => {
  it('lands settings exported before 0.3.15 under their plugins\' addresses', async () => {
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

    expect(stored()).toEqual({
      'default-setup/threads': { sort: 'oldest' },
      _meta: { visibility: { 'default-setup/browser': false }, lastActivePlugin: 'default-setup/notes' },
    });
    expect(repository.settingsQueries.getPluginSettings('threads')).toMatchObject({ sort: 'oldest' });
  });
});

describe('the plugin settings keys', () => {
  it('takes a plugin address or _meta', async () => {
    await startApp({ systems: [] });

    repository.settingsCommands.updateSettings('plugin', pluginSettingsKey('threads'), ['sort'], 'oldest');
    repository.settingsCommands.updateSettings('plugin', '_meta', ['visibility', 'default-setup/threads'], false);

    expect(stored()).toEqual({ 'default-setup/threads': { sort: 'oldest' }, _meta: { visibility: { 'default-setup/threads': false } } });
  });

  it('refuses a name, and writes nothing', async () => {
    await startApp({ systems: [] });

    expect(() => repository.settingsCommands.updateSettings('plugin', 'threads', ['sort'], 'oldest'))
      .toThrow(`"threads" isn't a plugin settings key`);
    expect(stored()).toBeUndefined();
  });
});
