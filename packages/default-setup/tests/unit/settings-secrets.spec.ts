// API keys in default-setup: the settings system refreshes its plugin when the host's stored keys change
// (never with values) and starts the assistant's birth flow once a required provider has a key, CLI paths live in
// the code plugin.
import { describe, expect, it, vi } from 'vitest';
import { addTestSecret, startApp, takeSystemErrors } from '@abuddy/testing/harness';
import { repository } from '@/__generated__/repository';
import { pluginSettingsKey } from '@/features/settings/plugin-settings';

describe('settings and stored API keys', () => {
  it('sends its plugin the keys without values when the stored keys change', async () => {
    const app = await startApp({ systems: ['settings'] });
    await app.connect();
    expect(app.emitted('settings').filter((e) => e.type === 'SECRETS_UPDATED').at(-1)).toMatchObject({ secrets: [] });

    const work = addTestSecret('anthropic', 'Work');
    await app.send('settings', { type: 'SECRETS_CHANGED' });

    const updated = app.emitted('settings').filter((e) => e.type === 'SECRETS_UPDATED').at(-1)!;
    expect(updated).toMatchObject({ secrets: [{ id: work.id, provider: 'anthropic', label: 'Work', selected: true }], status: { protection: 'os-keystore' } });
    expect(JSON.stringify(updated)).not.toContain('value');
  });

  it("starts the birth flow once a required provider has a selected key, and not after the assistant's birth", async () => {
    const app = await startApp({ systems: ['settings', 'threads'] });
    // Only the events reaching threads matter here: what threads does with them (the birth flow) runs on the brain
    const threads = vi.spyOn(app.system('threads'), 'send').mockImplementation(() => {});
    await app.connect();
    const births = () => threads.mock.calls.filter(([event]) => (event as { type: string }).type === 'BIRTH_FLOW_START').length;

    addTestSecret('google', 'Work');
    await app.send('settings', { type: 'SECRETS_CHANGED' });
    expect(births()).toBe(0);

    addTestSecret('anthropic', 'Work');
    await app.send('settings', { type: 'SECRETS_CHANGED' });
    expect(births()).toBe(1);

    repository.settingsCommands.updateSettings('assistant', null, ['birthdate'], new Date().toISOString());
    await app.send('settings', { type: 'SECRETS_CHANGED' });
    expect(births()).toBe(1);
  });

  it('keeps CLI path overrides in the code plugin settings, cleared from the cache when they change', async () => {
    const app = await startApp({ systems: ['settings'] });
    await app.connect();
    await app.send('settings', { type: 'UPDATE_SETTINGS', entityType: 'plugin', label: 'default-setup/code', path: ['cliPaths'], value: { gh: '/opt/bin/gh' } });
    expect(repository.settingsQueries.getPluginSettings(pluginSettingsKey('code'))).toMatchObject({ cliPaths: { gh: '/opt/bin/gh' } });
  });

  // A plugin's settings change reaches that plugin, at the ref the label names
  it('tells the plugin whose settings changed', async () => {
    const app = await startApp({ systems: ['settings'] });
    await app.connect();
    await app.send('settings', { type: 'UPDATE_SETTINGS', entityType: 'plugin', label: 'default-setup/code', path: ['mdEditorDefault'], value: false });
    const updated = await app.nextEmit('code', 'FEATURE_SETTINGS_UPDATED');
    expect(updated).toMatchObject({ type: 'FEATURE_SETTINGS_UPDATED', settings: { mdEditorDefault: false } });
  });

  // The frontend resolves a plugin's name to its address before sending; a bare label reaching the system
  // would be written under a key no plugin reads, so it is reported and nothing is saved
  it('refuses plugin settings labelled with a bare name, saving nothing', async () => {
    const app = await startApp({ systems: ['settings'] });
    await app.connect();
    await app.send('settings', { type: 'UPDATE_SETTINGS', entityType: 'plugin', label: 'code', path: ['cliPaths'], value: { gh: '/elsewhere/gh' } });
    expect(takeSystemErrors().map((e) => e.message)).toEqual([expect.stringContaining('Settings for plugin "code" weren\'t saved')]);
    expect(repository.settingsQueries.getPluginSettings(pluginSettingsKey('code'))).not.toMatchObject({ cliPaths: { gh: '/elsewhere/gh' } });
  });
});
