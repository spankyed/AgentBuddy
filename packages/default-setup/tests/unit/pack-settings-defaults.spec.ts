// A pack's feature settings (abuddy.json features[].settings) are defaults once the pack registers:
// its plugin's slice and sidebar visibility join the app's defaults, which stored settings override.
import { afterEach, describe, expect, it } from 'vitest';
import { registerPack, resetTestData, unregisterPack } from '@abuddy/testing/harness';
import { getDefaultSettings } from '@/features/settings/be/defaults';
import { repository } from '@/__generated__/repository';

const feature = (id: string, settings: Record<string, unknown>) => ({ id, hasSystem: false, hasPlugin: true, services: [], settings });
const registered: string[] = [];
/** Another pack, registered as the app registers an installed one */
function register(id: string, features: ReturnType<typeof feature>[]): void {
  registerPack({ id, systems: [], features });
  registered.push(id);
}
afterEach(() => {
  for (const id of registered.splice(0)) unregisterPack(id);
  resetTestData();
});

describe("packs' feature settings as defaults", () => {
  it("adds a registered pack's plugin settings and visibility, and drops them when it unregisters", () => {
    register('memo-pack', [feature('memos', { plugins: { _meta: { visibility: { memos: false } }, memos: { sort: 'newest' } } })]);
    expect(getDefaultSettings().plugins['memo-pack/memos']).toEqual({ sort: 'newest' });
    expect(getDefaultSettings().plugins._meta?.visibility).toMatchObject({ 'memo-pack/memos': false, 'default-setup/threads': true });
    expect(repository.settingsQueries.getPluginSettings('memo-pack/memos')).toEqual({ sort: 'newest' });
    expect(repository.settingsQueries.getSettings().plugins._meta?.visibility).toMatchObject({ 'memo-pack/memos': false });

    unregisterPack('memo-pack');
    registered.splice(0);
    expect(getDefaultSettings().plugins).not.toHaveProperty('memo-pack/memos');
    expect(getDefaultSettings().plugins._meta?.visibility).not.toHaveProperty('memo-pack/memos');
  });

  it("stores only the user's changes, so a pack's defaults still leave with it after a settings update", () => {
    register('memo-pack', [feature('memos', { plugins: { _meta: { visibility: { memos: false } }, memos: { sort: 'newest' } } })]);
    repository.settingsCommands.updateSettings('plugin', '_meta', ['lastActivePlugin'], 'memo-pack/memos');
    unregisterPack('memo-pack');
    registered.splice(0);
    const { plugins } = repository.settingsQueries.getSettings();
    expect(plugins._meta?.lastActivePlugin).toBe('memo-pack/memos');
    expect(plugins).not.toHaveProperty('memo-pack/memos');
    expect(plugins._meta?.visibility).not.toHaveProperty('memo-pack/memos');
  });

  it("keeps the user's stored settings over a pack's defaults", () => {
    register('memo-pack', [feature('memos', { plugins: { _meta: { visibility: { memos: false } }, memos: { sort: 'newest' } } })]);
    repository.settingsCommands.updateSettings('plugin', 'memo-pack/memos', ['sort'], 'oldest');
    repository.settingsCommands.updateSettings('plugin', '_meta', ['visibility', 'memo-pack/memos'], true);
    expect(repository.settingsQueries.getPluginSettings('memo-pack/memos')).toEqual({ sort: 'oldest' });
    expect(repository.settingsQueries.getSettings().plugins._meta?.visibility?.['memo-pack/memos']).toBe(true);
  });

  // Settings are keyed by the plugin's address, so another pack's `code` feature has its own slice
  it("gives a pack naming a feature after this pack's its own settings slice", () => {
    const appCode = getDefaultSettings().plugins['default-setup/code'];

    register('shadow-pack', [feature('code', { plugins: { _meta: { visibility: { code: false } }, code: { shadowed: true } } })]);

    expect(getDefaultSettings().plugins['default-setup/code']).toEqual(appCode);
    expect(getDefaultSettings().plugins._meta?.visibility?.['default-setup/code']).toBe(true);
    // The other pack's `code` plugin is its own, with its own settings
    expect(getDefaultSettings().plugins['shadow-pack/code']).toEqual({ shadowed: true });
  });
});
