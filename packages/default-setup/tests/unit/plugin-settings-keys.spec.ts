// A plugin's settings are stored under its ref, `<packId>/<featureId>`, and nothing else is stored there.
// Settings replaced wholesale (the settings editor, an export pasted back) may come from before 0.3.15, when they
// were stored under feature ids, with the app shell's state in `_meta`: the slices land under refs and the shell's
// state, which is the host's now, is dropped. A name that reaches the store unresolved throws rather than writing
// a slice no reader looks at.
import { afterEach, describe, expect, it } from 'vitest';
import { tx } from '@abuddy/ears';
import { registerPack, startApp, unregisterPack } from '@abuddy/testing/harness';
import { repository } from '@/__generated__/repository';
import { services } from '@/__generated__/services';
import { ref } from '@/__generated__/ref';

const stored = () => repository.settingsQueries.getStoredSettings().plugins as Record<string, any>;

describe('replacing the settings', () => {
  // The host moves the bare keys, told the data changed
  it("lands settings exported before 0.3.15 under their plugins' refs, without the shell's state", async () => {
    const app = await startApp({ systems: ['settings', 'host/application'] });
    await app.connect();

    await app.send('settings', {
      type: 'REPLACE_SETTINGS',
      data: {
        general: {},
        plugins: {
          threads: { sort: 'oldest' },
          _meta: { visibility: { browser: false }, lastActivePlugin: 'notes' },
        },
      },
    });
    await app.settle();

    expect(stored()).toEqual({ 'default-setup/threads': { sort: 'oldest' } });
    expect(repository.settingsQueries.getPluginSettings(ref('threads'))).toMatchObject({ sort: 'oldest' });
  });
});

describe('the plugin settings keys', () => {
  it("takes a plugin's ref", async () => {
    await startApp({ systems: [] });

    repository.settingsCommands.updateSettings('plugin', ref('threads'), ['sort'], 'oldest');

    expect(stored()).toEqual({ 'default-setup/threads': { sort: 'oldest' } });
  });

  it('refuses the app shell\'s old `_meta` key', async () => {
    await startApp({ systems: [] });

    // @ts-expect-error a plugin's settings are keyed by its ref
    expect(() => repository.settingsCommands.updateSettings('plugin', '_meta', ['visibility'], {}))
      .toThrow(`"_meta" isn't a plugin settings key`);
  });

  it('refuses a name, and writes nothing', async () => {
    await startApp({ systems: [] });

    // @ts-expect-error a plugin's settings are keyed by its ref
    expect(() => repository.settingsCommands.updateSettings('plugin', 'threads', ['sort'], 'oldest'))
      .toThrow(`"threads" isn't a plugin settings key`);
    expect(stored()).toBeUndefined();
  });

  // Read and written by the same key: a name would be read in the settings plugin's pack, whoever asked
  it('refuses a name when reading too', async () => {
    await startApp({ systems: [] });

    // @ts-expect-error a plugin's settings are keyed by its ref
    expect(() => repository.settingsQueries.getPluginSettings('threads')).toThrow(`"threads" isn't a plugin settings key`);
  });
});

// Dependent packs and actions reach the settings through services.settings. Resolving a bare name there would read
// and write the settings plugin's own pack's slice, whoever called: another pack's `memos` would land at
// `default-setup/memos`. So it takes the ref and refuses a name.
describe('services.settings', () => {
  it("reads and writes another pack's plugin at its ref", async () => {
    await startApp({ systems: [] });

    services.settings.updatePluginSetting('memo-pack/memos', ['sort'], 'oldest');

    expect(stored()).toEqual({ 'memo-pack/memos': { sort: 'oldest' } });
    expect(services.settings.getPluginSettings('memo-pack/memos')).toEqual({ sort: 'oldest' });
  });

  it('refuses a bare name, and writes nothing', async () => {
    await startApp({ systems: [] });

    // @ts-expect-error a plugin's settings are keyed by its ref
    expect(() => services.settings.updatePluginSetting('memos', ['sort'], 'oldest')).toThrow(`"memos" isn't a plugin settings key`);
    // @ts-expect-error a plugin's settings are keyed by its ref
    expect(() => services.settings.getPluginSettings('memos')).toThrow(`"memos" isn't a plugin settings key`);
    expect(stored()).toBeUndefined();
  });
});

// Whose a stored bare id is: the plugin with that feature id, and of several, the built-in pack's, since before
// 0.3.15 the built-in plugin was the one running under it. Every place that moves bare keys decides it this way.
describe('a bare id another pack shares', () => {
  const notesPack = { id: 'notes-pack', features: { notes: { plugin: { receives: [] }, settings: { plugins: { notes: { from: 'notes-pack' } } } } } };
  afterEach(() => {
    try { unregisterPack('notes-pack'); } catch { /* not registered */ }
  });

  it("goes to default-setup's plugin when settings from before 0.3.15 are pasted back", async () => {
    registerPack(notesPack);
    const app = await startApp({ systems: ['settings', 'host/application'] });
    await app.connect();

    await app.send('settings', { type: 'REPLACE_SETTINGS', data: { general: {}, plugins: { notes: { sort: 'title' } } } });
    await app.settle();

    expect(stored()).toEqual({ 'default-setup/notes': { sort: 'title' } });
  });
});

// A pack that wasn't loaded when 0.3.15 moved the keys (disabled then) gets its bare keys moved when it comes back:
// the app tells the running systems a pack changed, and the host moves whatever a registered plugin now owns.
describe('a pack registering', () => {
  const memoPack = { id: 'memo-pack', features: { memos: { plugin: { receives: [] }, settings: { plugins: { memos: { sort: 'newest' } } } } } };
  afterEach(() => {
    try { unregisterPack('memo-pack'); } catch { /* not registered */ }
  });

  it('gets the settings its plugins kept under their bare feature ids', async () => {
    const app = await startApp({ systems: ['settings', 'host/application'] });
    tx('Settings-app' as never).update('data', { plugins: { memos: { sort: 'oldest' }, unknown: { kept: true } } });

    registerPack(memoPack);
    await app.send('host/application', { type: 'PACK_CHANGED', packId: 'memo-pack' });

    expect(stored()).toEqual({ 'memo-pack/memos': { sort: 'oldest' }, unknown: { kept: true } });
  });
});
