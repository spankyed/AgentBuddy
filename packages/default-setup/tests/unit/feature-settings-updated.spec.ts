// Every feature, any pack's, hears when its settings change: its system (with what changed in its lists) and its
// plugin get FEATURE_SETTINGS_UPDATED, which the SDK declares for every system and plugin, whatever changed the
// settings. A feature with no system, or no plugin, just doesn't get that half.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assign, setup } from 'xstate';
import { registerPack, startApp, takeSystemErrors, unregisterPack } from '@abuddy/testing/harness';
import { settingsCommands } from '@/features/settings/be/repository';
import { services } from '@/__generated__/services';

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
    const app = await startApp({ systems: ['settings', 'memo-pack/memos'] });
    await app.connect();

    await app.send('settings', { type: 'UPDATE_SETTINGS', entityType: 'plugin', label: 'memo-pack/memos', path: ['tags'], value: [{ name: 'b' }] });

    expect(heardBy(app)).toEqual([{
      type: 'FEATURE_SETTINGS_UPDATED',
      settings: { tags: [{ name: 'b' }] },
      changes: { tags: expect.objectContaining({ added: [{ name: 'b' }], removed: [{ name: 'a' }] }) },
    }]);
    expect(app.emitted('memo-pack/memos')).toContainEqual({ type: 'FEATURE_SETTINGS_UPDATED', settings: { tags: [{ name: 'b' }] } });
  });

  it('tells only the features whose settings differ, when the settings are replaced or reset', async () => {
    const warned = vi.spyOn(console, 'warn');
    const app = await startApp({ systems: ['settings', 'memo-pack/memos'] });
    await app.connect();

    await app.send('settings', { type: 'REPLACE_SETTINGS', data: { general: {}, plugins: { 'memo-pack/board': { columns: 3 } } } as never });
    expect(heardBy(app)).toEqual([]);
    expect(app.emitted('memo-pack/board')).toContainEqual({ type: 'FEATURE_SETTINGS_UPDATED', settings: { columns: 3 } });

    await app.send('settings', { type: 'RESET_SETTINGS' });
    expect(app.emitted('memo-pack/board')).toContainEqual({ type: 'FEATURE_SETTINGS_UPDATED', settings: { columns: 2 } });
    expect(heardBy(app)).toEqual([]);
    // The board runs no system: its half of the event is nobody's, and nothing warns of a missing system
    expect(warned.mock.calls.flat().join(' ')).not.toContain('not found');
  });

  // A system's own write (the code system's browsed directory, the brain's inspect toggle), an action's or a seed's goes
  // straight to the repository. It reaches the feature once, and a later unrelated change doesn't send it again: told
  // late, a stale difference had the code explorer jump back to its default directory.
  it('tells the feature once when its settings are written outside the settings system, and not again later', async () => {
    const app = await startApp({ systems: ['settings', 'memo-pack/memos'] });
    await app.connect();

    settingsCommands.updateSettings('plugin', 'memo-pack/memos', ['tags'], [{ name: 'c' }]);
    await app.settle();
    expect(heardBy(app).map((e) => e.settings)).toEqual([{ tags: [{ name: 'c' }] }]);

    await app.send('settings', { type: 'UPDATE_SETTINGS', entityType: 'plugin', label: 'memo-pack/board', path: ['columns'], value: 4 });
    expect(heardBy(app)).toHaveLength(1);
  });

  it("tells the feature when an action writes its settings through services.settings", async () => {
    const app = await startApp({ systems: ['settings', 'memo-pack/memos'] });
    await app.connect();

    (services.settings as { updatePluginSetting(plugin: string, path: string[], value: unknown): void })
      .updatePluginSetting('memo-pack/memos', ['tags'], [{ name: 'd' }]);
    await app.settle();

    expect(heardBy(app).map((e) => e.settings)).toEqual([{ tags: [{ name: 'd' }] }]);
  });

  // A bare key would be stored where nothing reads it, for good
  it('refuses replaced settings holding a plugin key that is not a ref, storing none of them', async () => {
    const app = await startApp({ systems: ['settings', 'memo-pack/memos'] });
    await app.connect();

    await app.send('settings', { type: 'REPLACE_SETTINGS', data: { general: {}, plugins: { memos: { tags: [] } } } as never });

    expect(takeSystemErrors()).toEqual([expect.objectContaining({ message: expect.stringContaining(`"memos" isn't a plugin settings key`) })]);
    expect(heardBy(app)).toEqual([]);
  });

  // Its defaults leave with the pack, so the settings of its features change; their system and plugin are gone,
  // which is no mistake to report (the harness fails a test that leaves a reported drop)
  it('tells nobody, and reports nothing, when its pack leaves', async () => {
    const app = await startApp({ systems: ['settings'] });
    await app.connect();

    unregisterPack('memo-pack');
    await app.settle();

    expect(app.emitted('default-setup/settings').map((e) => e.type)).toContain('SETTINGS_UPDATED');
  });

  // A disabled pack keeps its stored settings; they can change (replaced, reset) while nothing of it runs
  it("reports nothing when settings of a plugin no pack registers change", async () => {
    const app = await startApp({ systems: ['settings'] });
    await app.connect();

    await app.send('settings', { type: 'REPLACE_SETTINGS', data: { general: {}, plugins: { 'disabled-pack/journal': { font: 'serif' } } } as never });

    expect(app.emitted('default-setup/settings').map((e) => e.type)).toContain('SETTINGS_UPDATED');
  });
});
