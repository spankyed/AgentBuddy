// API keys in default-setup: the settings system refreshes its plugin when the host's stored keys change
// (never with values), CLI paths live in the code plugin, and 0.3.15 moves old settings.
import { describe, expect, it } from 'vitest';
import { addTestSecret, startApp } from '@abuddy/testing/harness';
import { repository } from '@/__generated__/repository';
import { migration } from '../../src/migrations/0.3.15';

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
