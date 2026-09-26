// A plugin's settings are stored under its ref, `<packId>/<featureId>`, and nothing else is stored there. The store
// takes a `FeatureRef`; a name that arrives as a string (a client's send, an action's `services.settings` call) is
// parsed once where it arrives, and one that isn't an installed feature's with settings throws, naming the ref it
// likely meant, rather than writing a slice no reader looks at.
import { describe, expect, it, onTestFinished } from 'vitest';
import { registerPack, startApp, takeSystemErrors, unregisterPack } from '@abuddy/testing/harness';
import type { FeatureRef } from '@abuddy/sdk/ids';
import { services } from '@/__generated__/services';
import { ref } from '@/__generated__/ref';

const stored = () => services.settings.getStored().plugins as Record<string, any>;

describe('the plugin settings keys', () => {
  it("takes a plugin's ref", async () => {
    await startApp({ systems: ['host/settings'] });

    services.settings.setForFeature(ref('threads'), ['sort'], 'oldest');

    expect(stored()).toEqual({ 'default-setup/threads': { sort: 'oldest' } });
  });

  it('parses a name to the ref of an installed feature with settings, and refuses one that is none', async () => {
    await startApp({ systems: ['host/settings'] });

    expect(services.settings.forFeature('default-setup/threads') && 'default-setup/threads').toBe('default-setup/threads');
    expect(() => services.settings.forFeature('threads' as `${string}/${string}`))
      .toThrow('No installed feature with settings is named "threads": name a feature with settings as "<packId>/<featureId>" — did you mean "default-setup/threads"?');
    expect(() => services.settings.forFeature('default-setup/thread')).toThrow('No installed feature with settings is named "default-setup/thread"');
  });

  // An action can still reach the repository through services.repository: the one writer keeps the document's shape
  it("refuses to store a key that isn't a ref, whoever writes it", async () => {
    await startApp({ systems: ['host/settings'] });

    expect(() => services.settings.setForFeature('threads' as FeatureRef, ['sort'], 'oldest'))
      .toThrow(`No installed feature with settings is named "threads"`);
    expect(stored()).toBeUndefined();
  });

  it("refuses a client's update naming a plugin by a bare name, and writes nothing", async () => {
    const app = await startApp({ systems: ['host/settings'] });
    await app.connect();

    await app.send('host/settings', { type: 'UPDATE_SETTINGS', entityType: 'plugin', label: 'threads', path: ['sort'], value: 'oldest' });

    // The sender's mistake to fix, which its form shows: not a system error
    expect(app.emitted('host/settings')).toContainEqual({
      type: 'SETTINGS_REFUSED',
      problems: [expect.stringContaining('did you mean "default-setup/threads"?')],
    });
    expect(takeSystemErrors()).toEqual([]);
    expect(stored()).toBeUndefined();
  });
});

// Dependent packs and actions reach the settings through services.settings. Resolving a bare name there would read
// and write the settings plugin's own pack's slice, whoever called: another pack's `memos` would land at
// `default-setup/memos`. So it takes the ref and refuses a name.
describe('services.settings', () => {
  it("reads and writes another pack's plugin at its ref", async () => {
    registerPack({ id: 'memo-pack', features: { memos: { plugin: { receives: [] }, settings: { plugins: { memos: {} } } } } });
    onTestFinished(() => unregisterPack('memo-pack'));
    await startApp({ systems: ['host/settings'] });

    services.settings.setForFeature('memo-pack/memos', ['sort'], 'oldest');

    expect(stored()).toEqual({ 'memo-pack/memos': { sort: 'oldest' } });
    expect(services.settings.forFeature('memo-pack/memos')).toEqual({ sort: 'oldest' });
  });

  it('refuses a bare name, and writes nothing', async () => {
    await startApp({ systems: ['host/settings'] });

    // @ts-expect-error a plugin's settings are keyed by its ref
    expect(() => services.settings.setForFeature('threads', ['sort'], 'oldest')).toThrow('did you mean "default-setup/threads"?');
    // @ts-expect-error a plugin's settings are keyed by its ref
    expect(() => services.settings.forFeature('threads')).toThrow('did you mean "default-setup/threads"?');
    expect(stored()).toBeUndefined();
  });
});

// Checked by `npm run typecheck:pack`: ref() takes only the names this pack's code can write
it("doesn't compile a misspelled feature name", () => {
  const typed = (): void => {
    // @ts-expect-error `nots` names no feature this pack, a dependency or the host has
    ref('nots');
  };
  expect(ref('notes')).toBe('default-setup/notes');
  expect(typeof typed).toBe('function');
});
