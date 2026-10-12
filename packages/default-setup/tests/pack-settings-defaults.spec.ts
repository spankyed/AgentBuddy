import { z } from 'zod';
// A pack's feature settings (apack.json features[].settings) are defaults once the pack registers: its plugin's
// slice joins the app's default settings, which stored settings override, and whether its tab shows joins the
// visibility defaults the host's application system reads.
import { services } from '#generated/services.ts';
import { afterEach, describe, expect, it } from 'vitest';
import { getPackSettingsDefaults } from '@apackdev/sdk/framework';
import { registerPack, resetTestData, unregisterPack } from '@apackdev/testing/harness';
import { resolveName } from '@apackdev/sdk/ids';

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
  it("adds a registered pack's feature settings and visibility, and drops them when it unregisters", () => {
    register('memo-pack', [feature('memos', { visible: false, defaults: { sort: 'newest' }, schema: z.object({ sort: z.string() }).strict() })]);
    expect(getPackSettingsDefaults().settings.features['memo-pack/memos']).toEqual({ sort: 'newest' });
    expect(services.settings.forFeature(resolveName('memo-pack/memos'))).toEqual({ sort: 'newest' });
    expect(getPackSettingsDefaults().visibility).toMatchObject({ 'memo-pack/memos': false, 'default-setup/threads': true });

    unregisterPack('memo-pack');
    registered.splice(0);
    expect(getPackSettingsDefaults().settings.features).not.toHaveProperty('memo-pack/memos');
    expect(getPackSettingsDefaults().visibility).not.toHaveProperty('memo-pack/memos');
  });

  it("stores only the user's changes, so a pack's defaults still leave with it after a settings update", () => {
    register('memo-pack', [feature('memos', { defaults: { sort: 'newest' }, schema: z.object({ sort: z.string() }).strict() })]);
    services.settings.setForFeature(resolveName('default-setup/threads'), ['recentThreadsSortOrder'], 'created');
    unregisterPack('memo-pack');
    registered.splice(0);
    expect(services.settings.getAll().features).not.toHaveProperty('memo-pack/memos');
  });

  it("keeps the user's stored settings over a pack's defaults", () => {
    register('memo-pack', [feature('memos', { defaults: { sort: 'newest' }, schema: z.object({ sort: z.string() }).strict() })]);
    services.settings.setForFeature(resolveName('memo-pack/memos'), ['sort'], 'oldest');
    expect(services.settings.forFeature(resolveName('memo-pack/memos'))).toEqual({ sort: 'oldest' });
  });

  // Settings are keyed by the plugin's ref, so another pack's `code` feature has its own slice
  it("gives a pack naming a feature after this pack's its own settings slice and visibility", () => {
    const appCode = getPackSettingsDefaults().settings.features['default-setup/code'];

    register('shadow-pack', [feature('code', { visible: false, defaults: { shadowed: true }, schema: z.object({ shadowed: z.boolean() }).strict() })]);

    expect(getPackSettingsDefaults().settings.features['default-setup/code']).toEqual(appCode);
    expect(getPackSettingsDefaults().visibility['default-setup/code']).toBe(true);
    // The other pack's `code` plugin is its own, with its own settings
    expect(getPackSettingsDefaults().settings.features['shadow-pack/code']).toEqual({ shadowed: true });
    expect(getPackSettingsDefaults().visibility['shadow-pack/code']).toBe(false);
  });

  it('holds no app shell state in the settings', () => {
    expect(getPackSettingsDefaults().settings.features).not.toHaveProperty('_meta');
  });
});
