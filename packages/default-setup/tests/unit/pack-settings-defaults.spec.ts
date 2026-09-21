// A pack's feature settings (abuddy.json features[].settings) are defaults once the pack registers: its plugin's
// slice joins the app's default settings, which stored settings override, and whether its tab shows joins the
// visibility defaults the host's application system reads.
import { afterEach, describe, expect, it } from 'vitest';
import { getPackSettingsDefaults } from '@abuddy/sdk/framework';
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
    register('memo-pack', [feature('memos', { visible: false, plugins: { memos: { sort: 'newest' } } })]);
    expect(getDefaultSettings().plugins['memo-pack/memos']).toEqual({ sort: 'newest' });
    expect(repository.settingsQueries.getPluginSettings('memo-pack/memos')).toEqual({ sort: 'newest' });
    expect(getPackSettingsDefaults().visibility).toMatchObject({ 'memo-pack/memos': false, 'default-setup/threads': true });

    unregisterPack('memo-pack');
    registered.splice(0);
    expect(getDefaultSettings().plugins).not.toHaveProperty('memo-pack/memos');
    expect(getPackSettingsDefaults().visibility).not.toHaveProperty('memo-pack/memos');
  });

  it("stores only the user's changes, so a pack's defaults still leave with it after a settings update", () => {
    register('memo-pack', [feature('memos', { plugins: { memos: { sort: 'newest' } } })]);
    repository.settingsCommands.updateSettings('plugin', 'default-setup/threads', ['sort'], 'oldest');
    unregisterPack('memo-pack');
    registered.splice(0);
    expect(repository.settingsQueries.getSettings().plugins).not.toHaveProperty('memo-pack/memos');
  });

  it("keeps the user's stored settings over a pack's defaults", () => {
    register('memo-pack', [feature('memos', { plugins: { memos: { sort: 'newest' } } })]);
    repository.settingsCommands.updateSettings('plugin', 'memo-pack/memos', ['sort'], 'oldest');
    expect(repository.settingsQueries.getPluginSettings('memo-pack/memos')).toEqual({ sort: 'oldest' });
  });

  // Settings are keyed by the plugin's ref, so another pack's `code` feature has its own slice
  it("gives a pack naming a feature after this pack's its own settings slice and visibility", () => {
    const appCode = getDefaultSettings().plugins['default-setup/code'];

    register('shadow-pack', [feature('code', { visible: false, plugins: { code: { shadowed: true } } })]);

    expect(getDefaultSettings().plugins['default-setup/code']).toEqual(appCode);
    expect(getPackSettingsDefaults().visibility['default-setup/code']).toBe(true);
    // The other pack's `code` plugin is its own, with its own settings
    expect(getDefaultSettings().plugins['shadow-pack/code']).toEqual({ shadowed: true });
    expect(getPackSettingsDefaults().visibility['shadow-pack/code']).toBe(false);
  });

  it('holds no app shell state in the settings', () => {
    expect(getDefaultSettings().plugins).not.toHaveProperty('_meta');
  });
});
