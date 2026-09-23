// API keys in default-setup: the settings system refreshes its plugin when the host's stored keys change
// (never with values) and starts the assistant's birth flow once a required provider has a key, CLI paths live in
// the code plugin.
import { describe, expect, it, vi } from 'vitest';
import { addTestSecret, startApp, takeSystemErrors } from '@abuddy/testing/harness';
import { repository } from '@/__generated__/repository';
import { services } from '@/__generated__/services';
import { ref } from '@/__generated__/ref';

describe('settings and stored API keys', () => {
  it('sends its plugin the keys without values when the stored keys change', async () => {
    const app = await startApp({ systems: ['host/settings'] });
    await app.connect();
    expect(app.emitted('host/settings').filter((e) => e.type === 'SECRETS_UPDATED').at(-1)).toMatchObject({ secrets: [] });

    const work = addTestSecret('anthropic', 'Work');
    await app.send('host/settings', { type: 'SECRETS_CHANGED' });

    const updated = app.emitted('host/settings').filter((e) => e.type === 'SECRETS_UPDATED').at(-1)!;
    expect(updated).toMatchObject({ secrets: [{ id: work.id, provider: 'anthropic', label: 'Work', selected: true }], status: { protection: 'os-keystore' } });
    expect(JSON.stringify(updated)).not.toContain('value');
  });

  // The assistant's first flow is the threads feature's, so its trigger is too: the app only says the keys changed,
  // and every system that takes `SECRETS_CHANGED` hears it
  it("starts the birth flow once a required provider has a selected key, and not after the assistant's birth", async () => {
    const app = await startApp({ systems: ['threads', 'host/settings'] });
    // Only the events reaching threads matter here: what threads does with them (the birth flow) runs on the brain
    const threads = vi.spyOn(app.system('threads'), 'send');
    await app.connect();
    // Connecting births the assistant on its own; this covers the other way in, a key arriving later
    services.settings.setInSection('assistant', ['birthdate'], null);
    threads.mockClear();
    const births = () => threads.mock.calls.filter(([event]) => (event as { type: string }).type === 'BIRTH_FLOW_START').length;

    addTestSecret('google', 'Work');
    await app.send('threads', { type: 'SECRETS_CHANGED' });
    await app.settle();
    expect(births(), 'a provider the assistant cannot call a model with is not enough').toBe(0);

    addTestSecret('anthropic', 'Work');
    await app.send('threads', { type: 'SECRETS_CHANGED' });
    await app.settle();
    expect(births()).toBe(1);

    services.settings.setInSection('assistant', ['birthdate'], new Date().toISOString());
    await app.send('threads', { type: 'SECRETS_CHANGED' });
    await app.settle();
    expect(births()).toBe(1);
  });

  it('keeps CLI path overrides in the code plugin settings, cleared from the cache when they change', async () => {
    const app = await startApp({ systems: ['host/settings'] });
    await app.connect();
    await app.send('host/settings', { type: 'UPDATE_SETTINGS', entityType: 'plugin', label: 'default-setup/code', path: ['cliPaths'], value: { gh: '/opt/bin/gh' } });
    expect(services.settings.forFeature(ref('code'))).toMatchObject({ cliPaths: { gh: '/opt/bin/gh' } });
  });

  // A plugin's settings change reaches that plugin, at the ref the label names
  it('tells the plugin whose settings changed', async () => {
    const app = await startApp({ systems: ['host/settings'] });
    await app.connect();
    await app.send('host/settings', { type: 'UPDATE_SETTINGS', entityType: 'plugin', label: 'default-setup/code', path: ['mdEditorDefault'], value: false });
    const updated = await app.nextEmit('code', 'FEATURE_SETTINGS_UPDATED');
    expect(updated).toMatchObject({ type: 'FEATURE_SETTINGS_UPDATED', settings: { mdEditorDefault: false } });
  });

  // The frontend resolves a plugin's name to its address before sending; a bare label reaching the system
  // would be written under a key no plugin reads, so it is reported and nothing is saved
  it('refuses plugin settings labelled with a bare name, saving nothing', async () => {
    const app = await startApp({ systems: ['host/settings'] });
    await app.connect();
    await app.send('host/settings', { type: 'UPDATE_SETTINGS', entityType: 'plugin', label: 'code', path: ['cliPaths'], value: { gh: '/elsewhere/gh' } });
    // The sender's mistake to fix, which its form shows: not a system error
    expect(app.emitted('host/settings')).toContainEqual({
      type: 'SETTINGS_REFUSED',
      problems: [expect.stringContaining('did you mean "default-setup/code"?')],
    });
    expect(takeSystemErrors()).toEqual([]);
    expect(services.settings.forFeature(ref('code'))).not.toMatchObject({ cliPaths: { gh: '/elsewhere/gh' } });
  });
});
