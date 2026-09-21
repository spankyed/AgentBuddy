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
    expect(getDefaultSettings().plugins.memos).toEqual({ sort: 'newest' });
    expect(getDefaultSettings().plugins._meta?.visibility).toMatchObject({ memos: false, threads: true });
    expect(repository.settingsQueries.getPluginSettings('memos')).toEqual({ sort: 'newest' });
    expect(repository.settingsQueries.getSettings().plugins._meta?.visibility).toMatchObject({ memos: false });

    unregisterPack('memo-pack');
    registered.splice(0);
    expect(getDefaultSettings().plugins).not.toHaveProperty('memos');
    expect(getDefaultSettings().plugins._meta?.visibility).not.toHaveProperty('memos');
  });

  it("stores only the user's changes, so a pack's defaults still leave with it after a settings update", () => {
    register('memo-pack', [feature('memos', { plugins: { _meta: { visibility: { memos: false } }, memos: { sort: 'newest' } } })]);
    repository.settingsCommands.updateSettings('plugin', '_meta', ['lastActivePlugin'], 'memos');
    unregisterPack('memo-pack');
    registered.splice(0);
    const { plugins } = repository.settingsQueries.getSettings();
    expect(plugins._meta?.lastActivePlugin).toBe('memos');
    expect(plugins).not.toHaveProperty('memos');
    expect(plugins._meta?.visibility).not.toHaveProperty('memos');
  });

  it("keeps the user's stored settings over a pack's defaults", () => {
    register('memo-pack', [feature('memos', { plugins: { _meta: { visibility: { memos: false } }, memos: { sort: 'newest' } } })]);
    repository.settingsCommands.updateSettings('plugin', 'memos', ['sort'], 'oldest');
    repository.settingsCommands.updateSettings('plugin', '_meta', ['visibility', 'memos'], true);
    expect(repository.settingsQueries.getPluginSettings('memos')).toEqual({ sort: 'oldest' });
    expect(repository.settingsQueries.getSettings().plugins._meta?.visibility?.memos).toBe(true);
  });

  // Such a pack used to register with its plugin silently dropped, leaving its settings slice behind for a
  // plugin the user never saw. Claiming an id another pack holds is refused now, so nothing of it lands.
  it("refuses a pack feature that claims a plugin id this pack holds, leaving its defaults", () => {
    const appCode = getDefaultSettings().plugins.code;

    expect(() => register('shadow-pack', [feature('code', { plugins: { _meta: { visibility: { code: false } }, code: { shadowed: true } } })]))
      .toThrow('Plugin collision: id "code"');

    expect(getDefaultSettings().plugins.code).toEqual(appCode);
    expect(getDefaultSettings().plugins._meta?.visibility?.code).toBe(true);
  });
});
