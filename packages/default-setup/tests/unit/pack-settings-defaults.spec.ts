// A pack's feature settings (abuddy.json features[].settings) are defaults once the pack registers: its plugin's
// slice joins the app's default settings, which stored settings override, and whether its tab shows joins the
// visibility defaults the host's application system reads.
import { services } from '@/__generated__/services';
import { afterEach, describe, expect, it } from 'vitest';
import { getPackSettingsDefaults } from '@abuddy/sdk/framework';
import { registerPack, resetTestData, unregisterPack } from '@abuddy/testing/harness';
import { repository } from '@/__generated__/repository';
import { resolveName } from '@abuddy/sdk/ids';

/** A feature with a plugin and the given settings */
const feature = (id: string, settings: Record<string, unknown>) => [id, { plugin: { receives: [] }, settings }] as const;
const registered: string[] = [];
/** Another pack, registered as the app registers an installed one */
function register(id: string, features: ReturnType<typeof feature>[]): void {
  registerPack({ id, features: Object.fromEntries(features) });
  registered.push(id);
}
afterEach(() => {
  for (const id of registered.splice(0)) unregisterPack(id);
  resetTestData();
});

describe("packs' feature settings as defaults", () => {
  it("adds a registered pack's plugin settings and visibility, and drops them when it unregisters", () => {
    register('memo-pack', [feature('memos', { visible: false, plugins: { memos: { sort: 'newest' } } })]);
    expect(getPackSettingsDefaults().settings.plugins['memo-pack/memos']).toEqual({ sort: 'newest' });
    expect(services.settings.forFeature(resolveName('memo-pack/memos'))).toEqual({ sort: 'newest' });
    expect(getPackSettingsDefaults().visibility).toMatchObject({ 'memo-pack/memos': false, 'default-setup/threads': true });

    unregisterPack('memo-pack');
    registered.splice(0);
    expect(getPackSettingsDefaults().settings.plugins).not.toHaveProperty('memo-pack/memos');
    expect(getPackSettingsDefaults().visibility).not.toHaveProperty('memo-pack/memos');
  });

  it("stores only the user's changes, so a pack's defaults still leave with it after a settings update", () => {
    register('memo-pack', [feature('memos', { plugins: { memos: { sort: 'newest' } } })]);
    services.settings.setForFeature(resolveName('default-setup/threads'), ['sort'], 'oldest');
    unregisterPack('memo-pack');
    registered.splice(0);
    expect(services.settings.getAll().plugins).not.toHaveProperty('memo-pack/memos');
  });

  it("keeps the user's stored settings over a pack's defaults", () => {
    register('memo-pack', [feature('memos', { plugins: { memos: { sort: 'newest' } } })]);
    services.settings.setForFeature(resolveName('memo-pack/memos'), ['sort'], 'oldest');
    expect(services.settings.forFeature(resolveName('memo-pack/memos'))).toEqual({ sort: 'oldest' });
  });

  // Settings are keyed by the plugin's ref, so another pack's `code` feature has its own slice
  it("gives a pack naming a feature after this pack's its own settings slice and visibility", () => {
    const appCode = getPackSettingsDefaults().settings.plugins['default-setup/code'];

    register('shadow-pack', [feature('code', { visible: false, plugins: { code: { shadowed: true } } })]);

    expect(getPackSettingsDefaults().settings.plugins['default-setup/code']).toEqual(appCode);
    expect(getPackSettingsDefaults().visibility['default-setup/code']).toBe(true);
    // The other pack's `code` plugin is its own, with its own settings
    expect(getPackSettingsDefaults().settings.plugins['shadow-pack/code']).toEqual({ shadowed: true });
    expect(getPackSettingsDefaults().visibility['shadow-pack/code']).toBe(false);
  });

  it('holds no app shell state in the settings', () => {
    expect(getPackSettingsDefaults().settings.plugins).not.toHaveProperty('_meta');
  });
});
