// Catalog definitions supply defaults; persisted choices remain separate from navigation visibility.
import { featureSettings } from '#generated/settings.ts';
import { afterEach, describe, expect, it } from 'vitest';
import type { SettingsDefinition } from '@apackdev/sdk/framework';
import { getSettingsCatalog } from '@apackdev/sdk/framework';
import { getTestSettings, registerPack, resetTestData, unregisterPack } from '@apackdev/testing/harness';

/** A feature with a plugin and the given settings */
const feature = (id: string, settings: SettingsDefinition) => [id, { plugin: { receives: [] }, settings }] as const;
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
  it("adds a registered pack's feature definitions and effective defaults, and drops them when it unregisters", () => {
    register('memo-pack', [feature('memos', { defaults: { sort: 'newest' }, schema: {"type":"object","properties":{"sort":{"type":"string"}},"required":["sort"],"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"} })]);
    expect(getSettingsCatalog().features['memo-pack/memos']?.defaults).toEqual({ sort: 'newest' });
    expect(getTestSettings().forPack('memo-pack').get({ kind: 'feature', featureRef: 'memo-pack/memos' })).toEqual({ sort: 'newest' });
    expect(getTestSettings().getSnapshot().values.features['memo-pack/memos']).toEqual({ sort: 'newest' });

    unregisterPack('memo-pack');
    registered.splice(0);
    expect(getSettingsCatalog().features).not.toHaveProperty('memo-pack/memos');
  });

  it("stores only the user's changes, so a pack's defaults still leave with it after a settings update", () => {
    register('memo-pack', [feature('memos', { defaults: { sort: 'newest' }, schema: {"type":"object","properties":{"sort":{"type":"string"}},"required":["sort"],"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"} })]);
    featureSettings.forFeature('threads').set({ path: ['recentThreadsSortOrder'], value: 'created' });
    unregisterPack('memo-pack');
    registered.splice(0);
    expect(getTestSettings().getAll().features).not.toHaveProperty('memo-pack/memos');
  });

  it("keeps the user's stored settings over a pack's defaults", () => {
    register('memo-pack', [feature('memos', { defaults: { sort: 'newest' }, schema: {"type":"object","properties":{"sort":{"type":"string"}},"required":["sort"],"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"} })]);
    getTestSettings().forPack('memo-pack').set({ kind: 'feature', featureRef: 'memo-pack/memos' }, ['sort'], 'oldest');
    expect(getTestSettings().forPack('memo-pack').get({ kind: 'feature', featureRef: 'memo-pack/memos' })).toEqual({ sort: 'oldest' });
  });

  // Settings are keyed by the plugin's ref, so another pack's `code` feature has its own slice
  it("gives a pack naming a feature after this pack's its own settings identity", () => {
    const appCode = getSettingsCatalog().features['default-setup/code'];

    register('shadow-pack', [feature('code', { defaults: { shadowed: true }, schema: {"type":"object","properties":{"shadowed":{"type":"boolean"}},"required":["shadowed"],"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"} })]);

    expect(getSettingsCatalog().features['default-setup/code']).toEqual(appCode);
    // The other pack's `code` plugin is its own, with its own settings
    expect(getSettingsCatalog().features['shadow-pack/code']?.defaults).toEqual({ shadowed: true });
  });

  it('holds no app shell state in the settings', () => {
    expect(getSettingsCatalog().features).not.toHaveProperty('_meta');
  });
});
