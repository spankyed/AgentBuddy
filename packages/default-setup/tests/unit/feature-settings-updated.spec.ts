// Every feature, any pack's, hears when its settings change: its system (with what changed in its lists) and its
// plugin get FEATURE_SETTINGS_UPDATED, which the SDK declares for every system and plugin, whatever changed the
// settings. A feature with no system, or no plugin, just doesn't get that half.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assign, setup } from 'xstate';
import { mockService, registerPack, startApp, takeSystemErrors, unregisterPack } from '@abuddy/testing/harness';
import { tx } from '@abuddy/ears';
import type { EARS } from '@abuddy/sdk';

import { services } from '@/__generated__/services';
import { resolveName } from '@abuddy/sdk/ids';

/** A system that keeps each FEATURE_SETTINGS_UPDATED it gets */
const recorder = setup({ types: { context: {} as { heard: unknown[] } } }).createMachine({
  context: { heard: [] },
  on: { FEATURE_SETTINGS_UPDATED: { actions: assign({ heard: ({ context, event }) => [...context.heard, event] }) } },
});

beforeEach(() => {
  registerPack({
    id: 'memo-pack',
    features: {
      memos: { system: { machine: recorder, receives: [] }, plugin: { receives: [] }, settings: { plugins: { memos: { tags: [{ name: 'a' }] } } } },
      // Settings but no system: only its plugin hears
      board: { plugin: { receives: [] }, settings: { plugins: { board: { columns: 2 } } } },
    },
  });
});
afterEach(() => {
  try { unregisterPack('memo-pack'); } catch { /* the test unregistered it */ }
  vi.restoreAllMocks();
});

const heardBy = (app: Awaited<ReturnType<typeof startApp>>) => (app.system('memo-pack/memos').getSnapshot().context as { heard: any[] }).heard;

describe('a feature whose settings change', () => {
  it('tells its system, with what changed in its lists, and its plugin', async () => {
    const app = await startApp({ systems: ['memo-pack/memos', 'host/settings'] });
    await app.connect();

    await app.send('host/settings', { type: 'UPDATE_SETTINGS', entityType: 'plugin', label: 'memo-pack/memos', path: ['tags'], value: [{ name: 'b' }] });

    expect(heardBy(app)).toEqual([{
      type: 'FEATURE_SETTINGS_UPDATED',
      settings: { tags: [{ name: 'b' }] },
      changes: { tags: expect.objectContaining({ added: [{ name: 'b' }], removed: [{ name: 'a' }] }) },
    }]);
    expect(app.emitted('memo-pack/memos')).toContainEqual({ type: 'FEATURE_SETTINGS_UPDATED', settings: { tags: [{ name: 'b' }] } });
  });

  it('tells only the features whose settings differ, when the settings are replaced or reset', async () => {
    const warned = vi.spyOn(console, 'warn');
    const app = await startApp({ systems: ['memo-pack/memos', 'host/settings'] });
    await app.connect();

    await app.send('host/settings', { type: 'REPLACE_SETTINGS', data: { general: {}, plugins: { 'memo-pack/board': { columns: 3 } } } as never });
    expect(heardBy(app)).toEqual([]);
    expect(app.emitted('memo-pack/board')).toContainEqual({ type: 'FEATURE_SETTINGS_UPDATED', settings: { columns: 3 } });

    await app.send('host/settings', { type: 'RESET_SETTINGS' });
    expect(app.emitted('memo-pack/board')).toContainEqual({ type: 'FEATURE_SETTINGS_UPDATED', settings: { columns: 2 } });
    expect(heardBy(app)).toEqual([]);
    // The board runs no system: its half of the event is nobody's, and nothing warns of a missing system
    expect(warned.mock.calls.flat().join(' ')).not.toContain('not found');
  });

  // A system's own write (the code system's browsed directory, the brain's inspect toggle), an action's or a seed's goes
  // straight to the repository. It reaches the feature once, and a later unrelated change doesn't send it again: told
  // late, a stale difference had the code explorer jump back to its default directory.
  it('tells the feature once when its settings are written outside the settings system, and not again later', async () => {
    const app = await startApp({ systems: ['memo-pack/memos', 'host/settings'] });
    await app.connect();

    services.settings.setForFeature(resolveName('memo-pack/memos'), ['tags'], [{ name: 'c' }]);
    await app.settle();
    expect(heardBy(app).map((e) => e.settings)).toEqual([{ tags: [{ name: 'c' }] }]);

    await app.send('host/settings', { type: 'UPDATE_SETTINGS', entityType: 'plugin', label: 'memo-pack/board', path: ['columns'], value: 4 });
    expect(heardBy(app)).toHaveLength(1);
  });

  it("tells the feature when an action writes its settings through services.settings", async () => {
    const app = await startApp({ systems: ['memo-pack/memos', 'host/settings'] });
    await app.connect();

    (services.settings as { setForFeature(plugin: string, path: string[], value: unknown): void })
      .setForFeature('memo-pack/memos', ['tags'], [{ name: 'd' }]);
    await app.settle();

    expect(heardBy(app).map((e) => e.settings)).toEqual([{ tags: [{ name: 'd' }] }]);
  });

  // A reset rewrites the settings with the rest of the data. Each feature is told its settings with no changes once it
  // ends, however it ends, and a later change isn't told as a difference across the reset.
  describe('an app reset', () => {
    /** A reset that writes the settings as the real one does, then succeeds or throws */
    const resetWriting = (tags: unknown[], outcome: 'succeeds' | 'fails') => mockService('appData', {
      reset: async () => {
        services.settings.setForFeature(resolveName('memo-pack/memos'), ['tags'], tags);
        if (outcome === 'fails') throw new Error('store could not reopen');
      },
    });

    it.each(['succeeds', 'fails'] as const)('tells each feature its settings with no changes once it %s', async (outcome) => {
      resetWriting([{ name: 'fresh' }], outcome);
      const app = await startApp({ systems: ['memo-pack/memos', 'host/settings'] });
      await app.connect();

      await app.send('host/settings', { type: 'RESET_APP' });
      await app.settle();

      expect(heardBy(app)).toEqual([{ type: 'FEATURE_SETTINGS_UPDATED', settings: { tags: [{ name: 'fresh' }] }, changes: null }]);
      await app.send('host/settings', { type: 'UPDATE_SETTINGS', entityType: 'plugin', label: 'memo-pack/board', path: ['columns'], value: 5 });
      expect(heardBy(app)).toHaveLength(1);
      if (outcome === 'fails') takeSystemErrors();
    });
  });

  // An import replaces the stored rows past the settings' writer, so nothing else tells the features
  it('tells each feature its settings with no changes after a backup import, and not a diff across it later', async () => {
    mockService('appData', {
      importBackup: async () => {
        tx('Settings-app' as EARS.EntityId).put('data', { plugins: { 'memo-pack/memos': { tags: [{ name: 'imported' }] } } })
        return { databases: ['lmdb'], missingDatabases: [], unknownEntityTypes: [] }
      },
    });
    const app = await startApp({ systems: ['database', 'memo-pack/memos', 'host/settings'] });
    await app.connect();

    await app.send('database', { type: 'IMPORT_DATABASE', path: '/backups/1' } as never);
    await app.settle();

    expect(heardBy(app)).toEqual([{ type: 'FEATURE_SETTINGS_UPDATED', settings: { tags: [{ name: 'imported' }] }, changes: null }]);
    await app.send('host/settings', { type: 'UPDATE_SETTINGS', entityType: 'plugin', label: 'memo-pack/board', path: ['columns'], value: 6 });
    expect(heardBy(app)).toHaveLength(1);
  });

  // The import's migrations write the settings through the repository before the imported data is announced: a diff
  // against what features heard before the import would have them rewrite rows that came in with it
  describe('a backup import whose migrations write the settings', () => {
    const importWriting = (outcome: 'succeeds' | 'fails') => mockService('appData', {
      importBackup: async () => {
        // Before the import's first await, and after it: the writes tell nothing whenever they happen
        services.settings.setForFeature(resolveName('memo-pack/memos'), ['tags'], [{ name: 'early' }]);
        await Promise.resolve();
        tx('Settings-app' as EARS.EntityId).put('data', { plugins: { 'memo-pack/memos': { tags: [{ name: 'imported' }] } } });
        services.settings.setForFeature(resolveName('memo-pack/memos'), ['tags'], [{ name: 'migrated' }]);
        if (outcome === 'fails') throw new Error('backup unreadable');
        return { databases: ['lmdb'], missingDatabases: [], unknownEntityTypes: [] };
      },
    });

    it.each(['succeeds', 'fails'] as const)('tells each feature no changes when it %s', async (outcome) => {
      importWriting(outcome);
      const app = await startApp({ systems: ['database', 'memo-pack/memos', 'host/settings'] });
      await app.connect();

      await app.send('database', { type: 'IMPORT_DATABASE', path: '/backups/1' } as never);
      await app.settle();

      expect(heardBy(app)).toEqual([{ type: 'FEATURE_SETTINGS_UPDATED', settings: { tags: [{ name: 'migrated' }] }, changes: null }]);
      await app.send('host/settings', { type: 'UPDATE_SETTINGS', entityType: 'plugin', label: 'memo-pack/board', path: ['columns'], value: 7 });
      expect(heardBy(app)).toHaveLength(1);
    });
  });

  // A settings form says "Saved" on the store's answer, so every change it sends gets one
  it('answers a change with what the store did: stored, or refused with its reasons', async () => {
    const app = await startApp({ systems: ['memo-pack/memos', 'host/settings'] });
    await app.connect();

    await app.send('host/settings', { type: 'UPDATE_SETTINGS', entityType: 'plugin', label: 'memo-pack/memos', path: ['tags'], value: [] });
    expect(app.emitted('host/settings')).toContainEqual({ type: 'SETTINGS_SAVED' });

    await app.send('host/settings', { type: 'UPDATE_SETTINGS', entityType: 'plugin', label: 'memos', path: ['tags'], value: [] });
    expect(app.emitted('host/settings')).toContainEqual({
      type: 'SETTINGS_REFUSED',
      problems: [expect.stringContaining('did you mean "memo-pack/memos"?')],
    });
  });

  // The import replaces the same stores a reset does, and a pack's defaults coming or going while it runs would be
  // diffed against what features were told before it
  describe('while a backup import runs', () => {
    /** Starts an import that settles when `finish` is called, and waits until the settings system has heard it start */
    async function importing(app: Awaited<ReturnType<typeof startApp>>) {
      let finish!: () => void;
      const done = new Promise<void>((resolve) => { finish = resolve; });
      mockService('appData', { importBackup: async () => { await done; return { databases: ['lmdb'], missingDatabases: [], unknownEntityTypes: [] }; } });
      await app.send('database', { type: 'IMPORT_DATABASE', path: '/backups/1' } as never);
      return { finish };
    }

    it('refuses an app reset, which would race it over the same stores', async () => {
      const app = await startApp({ systems: ['database', 'memo-pack/memos', 'host/settings'] });
      await app.connect();
      const { finish } = await importing(app);

      await app.send('host/settings', { type: 'RESET_APP' });

      expect(app.emitted('host/settings')).toContainEqual({ type: 'APP_RESET_FAILED', error: expect.stringContaining('backup is being imported') });
      finish();
      await app.settle();
    });

    it("tells no feature a pack's settings changed until it ends", async () => {
      const app = await startApp({ systems: ['database', 'memo-pack/memos', 'host/settings'] });
      await app.connect();
      services.settings.setForFeature(resolveName('memo-pack/memos'), ['tags'], [{ name: 'before' }]);
      await app.settle();
      const heardBefore = heardBy(app).length;
      const { finish } = await importing(app);

      tx('Settings-app' as EARS.EntityId).put('data', { plugins: { 'memo-pack/memos': { tags: [{ name: 'imported' }] } } });
      await app.send('host/settings', { type: 'PACK_CHANGED', packId: 'memo-pack' } as never);
      expect(heardBy(app)).toHaveLength(heardBefore);

      finish();
      await app.settle();
      expect(heardBy(app).slice(heardBefore)).toEqual([{ type: 'FEATURE_SETTINGS_UPDATED', settings: { tags: [{ name: 'imported' }] }, changes: null }]);
    });

    // A settings form waits for the store's answer before it says "Saved", so a change taken and never answered
    // leaves it saying "Saving" for good
    it('refuses a change sent while it runs, rather than leaving the form waiting for an answer', async () => {
      const app = await startApp({ systems: ['database', 'memo-pack/memos', 'host/settings'] });
      await app.connect();
      const { finish } = await importing(app);

      await app.send('host/settings', { type: 'UPDATE_SETTINGS', entityType: 'plugin', label: 'memo-pack/memos', path: ['tags'], value: [] } as never);

      expect(app.emitted('host/settings')).toContainEqual({
        type: 'SETTINGS_REFUSED',
        problems: [expect.stringContaining('backup is being imported')],
      });
      finish();
      await app.settle();
    });

    // A read only reports what is stored, and the settings page waits for one before it renders
    it('serves a read, so opening the settings page while it runs still loads', async () => {
      const app = await startApp({ systems: ['database', 'memo-pack/memos', 'host/settings'] });
      await app.connect();
      const { finish } = await importing(app);
      const before = app.emitted('host/settings').length;

      await app.send('host/settings', { type: 'GET_SETTINGS' } as never);

      expect(app.emitted('host/settings').slice(before)).toContainEqual(
        expect.objectContaining({ type: 'SETTINGS_LOADED' }),
      );
      finish();
      await app.settle();
    });
  });

  // A bare key would be stored where nothing reads it, for good. A refusal is the user's to fix, not the system's
  // error: the settings plugin hears it with the reasons
  it('refuses replaced settings holding a plugin key that is not a ref, naming the ref it likely meant', async () => {
    const app = await startApp({ systems: ['memo-pack/memos', 'host/settings'] });
    await app.connect();

    await app.send('host/settings', { type: 'REPLACE_SETTINGS', data: { general: {}, plugins: { memos: { tags: [] } } } });

    expect(app.emitted('host/settings')).toContainEqual({
      type: 'SETTINGS_REFUSED',
      problems: [expect.stringMatching(/^No installed feature with settings is named "memos": .* did you mean "memo-pack\/memos"\?/)],
    });
    expect(app.emitted('host/settings').map((e) => e.type)).not.toContain('SETTINGS_SAVED');
    expect(services.settings.getStored<Record<string, any>>()).toEqual({});
    expect(heardBy(app)).toEqual([]);
  });

  it.each([
    ['null', null, 'The settings must be a JSON object'],
    ['an array', [], 'The settings must be a JSON object'],
    ['a section that is not an object', { general: {}, plugins: null }, '"plugins" must be an object'],
    ['a section the settings do not hold', { general: {}, extra: {} }, `"extra" isn't a settings section`],
  ])('refuses replaced settings that are %s, storing nothing', async (_, data, problem) => {
    const app = await startApp({ systems: ['memo-pack/memos', 'host/settings'] });
    await app.connect();

    await app.send('host/settings', { type: 'REPLACE_SETTINGS', data });

    expect(app.emitted('host/settings')).toContainEqual({ type: 'SETTINGS_REFUSED', problems: [expect.stringContaining(problem)] });
    expect(services.settings.getStored<Record<string, any>>()).toEqual({});
  });

  // The editor sends the settings in effect, defaults included: storing them as given would freeze today's defaults
  // into the user's settings, where a later default change never reaches them
  it('stores what replaced settings change from the defaults, and says it saved them', async () => {
    const app = await startApp({ systems: ['memo-pack/memos', 'host/settings'] });
    await app.connect();
    const inEffect = services.settings.getAll<Record<string, any>>();

    await app.send('host/settings', {
      type: 'REPLACE_SETTINGS',
      data: { ...inEffect, plugins: { ...inEffect.plugins, 'memo-pack/board': { columns: 5 } } },
    });

    expect(services.settings.getStored<Record<string, any>>()).toEqual({ plugins: { 'memo-pack/board': { columns: 5 } } });
    expect(app.emitted('host/settings')).toContainEqual({ type: 'SETTINGS_SAVED' });
  });

  // Its defaults leave with the pack, so the settings of its features change; their system and plugin are gone,
  // which is no mistake to report (the harness fails a test that leaves a reported drop)
  it('tells nobody, and reports nothing, when its pack leaves', async () => {
    const app = await startApp({ systems: ['host/settings'] });
    await app.connect();

    unregisterPack('memo-pack');
    await app.settle();

    expect(app.emitted('host/settings').map((e) => e.type)).toContain('SETTINGS_UPDATED');
  });

  // A pack installed but not running (disabled) keeps its settings, which can change (the host's registry lists its
  // features from its manifest, host/tests/packs); one no installed pack has is refused, and one of an uninstalled
  // pack stays as it was, for its reinstall
  it('refuses changed settings of a feature no installed pack has, and keeps an uninstalled pack\'s unchanged', async () => {
    tx('Settings-app' as EARS.EntityId, true).put('entityType', 'Settings').put('data', { plugins: { 'gone-pack/journal': { font: 'serif' } } });
    const app = await startApp({ systems: ['host/settings'] });
    await app.connect();

    await app.send('host/settings', { type: 'REPLACE_SETTINGS', data: { plugins: { 'gone-pack/journal': { font: 'serif' }, 'memo-pack/memo': { tags: [] } } } });
    expect(app.emitted('host/settings')).toContainEqual({
      type: 'SETTINGS_REFUSED',
      problems: [expect.stringContaining('No installed feature with settings is named "memo-pack/memo"')],
    });

    await app.send('host/settings', { type: 'REPLACE_SETTINGS', data: { plugins: { 'gone-pack/journal': { font: 'serif' }, 'memo-pack/board': { columns: 9 } } } });
    expect(services.settings.getStored<Record<string, any>>().plugins).toEqual({ 'gone-pack/journal': { font: 'serif' }, 'memo-pack/board': { columns: 9 } });
  });
});

// A key such as `__proto__` in a path or in replaced settings is data: it's stored as an own key and reaches no
// prototype, in the API process or in the settings merged from the defaults
describe('settings naming prototype machinery', () => {
  afterEach(() => { delete (Object.prototype as Record<string, unknown>).polluted; });

  it.each([
    ['a path segment', { entityType: 'general', label: 'application', path: ['__proto__', 'polluted'] }],
    ['a label', { entityType: 'general', label: '__proto__', path: ['polluted'] }],
    ['a constructor path', { entityType: 'general', label: 'application', path: ['constructor', 'prototype', 'polluted'] }],
    ["a plugin's path", { entityType: 'plugin', label: 'memo-pack/memos', path: ['__proto__', 'polluted'] }],
  ])('keeps %s as data, and pollutes nothing', async (_, update) => {
    const app = await startApp({ systems: ['host/settings'] });
    await app.connect();

    await app.send('host/settings', { type: 'UPDATE_SETTINGS', ...update, value: 'yes' } as never);

    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.getPrototypeOf(services.settings.getAll().general)).toBe(Object.prototype);
  });

  it('keeps such a key in replaced settings as data, and pollutes nothing', async () => {
    const app = await startApp({ systems: ['host/settings'] });
    await app.connect();

    // As a client's JSON arrives: "__proto__" an own key
    const data = JSON.parse('{ "general": {}, "plugins": { "memo-pack/memos": { "__proto__": { "polluted": "yes" } } } }');
    await app.send('host/settings', { type: 'REPLACE_SETTINGS', data });

    const memos = services.settings.forFeature(resolveName('memo-pack/memos')) as Record<string, unknown>;
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(memos.polluted).toBeUndefined();
    expect(Object.getPrototypeOf(memos)).toBe(Object.prototype);
  });
});
