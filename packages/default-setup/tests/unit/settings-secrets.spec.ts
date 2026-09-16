// API keys in default-setup: the settings system refreshes its plugin when the host's stored keys change
// (never with values) and starts the assistant's birth flow once a required provider has a key, CLI paths live in
// the code plugin.
import { describe, expect, it, vi } from 'vitest';
import { addTestSecret, startApp } from '@abuddy/testing/harness';
import { repository } from '@/__generated__/repository';

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
    await app.send('settings', { type: 'UPDATE_SETTINGS', entityType: 'plugin', label: 'code', path: ['cliPaths'], value: { gh: '/opt/bin/gh' } });
    expect(repository.settingsQueries.getPluginSettings('code')).toMatchObject({ cliPaths: { gh: '/opt/bin/gh' } });
  });
});
