// API keys in default-setup: the settings system refreshes its plugin and threads when the host's stored keys change
// (never with values), settings updates can't carry keys, CLI paths live in the code plugin, and 0.3.15 moves old settings.
import { describe, expect, it } from 'vitest';
import { addTestSecret, startApp } from '@abuddy/testing/harness';
import { repository } from '@/__generated__/repository';
import { services } from '@/__generated__/services';
import { migration } from '../../src/migrations/0.3.15';

describe('settings and stored API keys', () => {
  it('sends its plugin the keys without values, and threads the key status, when the stored keys change', async () => {
    const app = await startApp({ systems: ['settings', 'threads', 'brain'] });
    await app.connect();
    expect(app.emitted('settings').filter((e) => e.type === 'SECRETS_UPDATED').at(-1)).toMatchObject({ secrets: [] });

    const work = addTestSecret('anthropic', 'Work');
    await app.send('settings', { type: 'SECRETS_CHANGED' });

    const updated = app.emitted('settings').filter((e) => e.type === 'SECRETS_UPDATED').at(-1)!;
    expect(updated).toMatchObject({ secrets: [{ id: work.id, provider: 'anthropic', label: 'Work', selected: true }], status: { protection: 'os-keystore' } });
    expect(JSON.stringify(updated)).not.toContain('value');
    expect(app.emitted('threads').filter((e) => e.type === 'API_KEYS_STATUS').at(-1)).toMatchObject({ hasRequiredApiKeys: true });
  });

  it('reports no required key when the required providers have keys but none selected', async () => {
    const work = addTestSecret('openai', 'Work');
    addTestSecret('openai', 'Personal');
    services.secrets.delete(work.id);
    addTestSecret('groq', 'Fast');
    expect(repository.chatQueries.hasRequiredApiKeys()).toBe(false);
    services.secrets.select(services.secrets.list().find((secret) => secret.label === 'Personal')!.id);
    expect(repository.chatQueries.hasRequiredApiKeys()).toBe(true);
  });

  it('drops a settings update addressed to API keys instead of storing it', async () => {
    const app = await startApp({ systems: ['settings'] });
    await app.connect();
    await app.send('settings', { type: 'UPDATE_SETTINGS', entityType: 'general', label: 'secrets', path: ['secrets_operation'], value: { type: 'CREATE_API_KEY', provider: 'openai', value: 'sk-should-not-be-stored-123456' } });
    expect(JSON.stringify(repository.settingsQueries.getSettings())).not.toContain('sk-should-not-be-stored');
    expect(app.emitted('settings').some((e) => e.type === 'SETTINGS_UPDATED')).toBe(false);
  });

  it('keeps CLI path overrides in the code plugin settings, cleared from the cache when they change', async () => {
    const app = await startApp({ systems: ['settings'] });
    await app.connect();
    await app.send('settings', { type: 'UPDATE_SETTINGS', entityType: 'plugin', label: 'code', path: ['cliPaths'], value: { gh: '/opt/bin/gh' } });
    expect(repository.settingsQueries.getPluginSettings('code')).toMatchObject({ cliPaths: { gh: '/opt/bin/gh' } });
  });
});

describe('migration 0.3.15', () => {
  const store = (general: Record<string, unknown>) => repository.settingsCommands.replaceSettings({ general } as never);

  it('moves CLI paths to the code plugin and drops the general.secrets key map; a second run changes nothing', () => {
    store({ secrets: { openai: 'Secret-1', custom: { GitHub: 'Secret-2' }, required: ['openai'], cliPaths: { gh: '/usr/local/bin/gh', codex: '' } } });

    migration.up();
    const once = repository.settingsQueries.getSettings();
    migration.up();

    expect((once.general as unknown as Record<string, unknown>).secrets).toBeUndefined();
    expect(repository.settingsQueries.getPluginSettings('code')).toMatchObject({ cliPaths: { gh: '/usr/local/bin/gh' } });
    expect((repository.settingsQueries.getPluginSettings('code') as { cliPaths: Record<string, string> }).cliPaths).not.toHaveProperty('codex');
    expect(repository.settingsQueries.getSettings()).toEqual(once);
  });

  it("keeps CLI paths the code plugin already has", () => {
    store({ secrets: { cliPaths: { gh: '/old/gh' } } });
    repository.settingsCommands.updateSettings('plugin', 'code', ['cliPaths'], { gh: '/new/gh' });
    migration.up();
    expect(repository.settingsQueries.getPluginSettings('code')).toMatchObject({ cliPaths: { gh: '/new/gh' } });
  });
});
