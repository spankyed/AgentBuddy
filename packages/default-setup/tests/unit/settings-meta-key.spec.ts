// `_meta` is the reserved key inside `plugins` holding the app's own metadata — which plugins are
// visible, which was last active. It is not a plugin, and the settings system must not treat it as one:
// every toolbar visibility toggle and every plugin switch writes it.
import { describe, expect, it } from 'vitest';
import { startApp } from '@abuddy/testing/harness';

const hidePlugin = { type: 'UPDATE_SETTINGS', entityType: 'plugin', label: '_meta', path: ['visibility', 'default-setup/notes'], value: false } as const;

describe('the _meta settings key', () => {
  // Before this was excluded the system sent `_META_SETTINGS_UPDATED` to a plugin called `_meta`,
  // which the bus dropped and reported — so this test also fails on the system error it left.
  it('is not broadcast to a plugin, because no such plugin exists', async () => {
    const app = await startApp({ systems: ['settings'] });
    await app.connect();

    await app.send('settings', hidePlugin);

    expect(app.emitted('_meta')).toEqual([]);
  });

  // The write itself still has to happen: hiding a plugin is a real setting
  it('still records the visibility it was asked to change', async () => {
    const app = await startApp({ systems: ['settings'] });
    await app.connect();

    await app.send('settings', hidePlugin);

    const updates = app.emitted('settings').filter((e) => e.type === 'SETTINGS_UPDATED');
    const last = updates.at(-1) as { data?: { plugins?: { _meta?: { visibility?: Record<string, boolean> } } } } | undefined;
    expect(last?.data?.plugins?._meta?.visibility?.['default-setup/notes']).toBe(false);
  });
});
