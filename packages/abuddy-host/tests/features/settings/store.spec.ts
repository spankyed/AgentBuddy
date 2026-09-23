// The one Settings row and the one writer to it. What the store guarantees: the row holds only the user's changes,
// the settings in effect are the defaults with those over them, every write is checked once, and the listeners hear
// each change in the order it happened — including the two that bracket a wholesale replacement.
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { untypedQx } from '@abuddy/ears';
import { resetTestData } from '@abuddy/sdk/testing';
import type { EARS } from '@abuddy/sdk';
import type { PackRegistration } from '@abuddy/sdk/framework';
import { registry } from '../../packs/runtime/test-host.ts';
import { PLUGINS_SECTION, SettingsRefusedError } from '../../../src/features/settings/be/document.ts';
import { createSettingsStore, SETTINGS_ENTITY, type SettingsDocument } from '../../../src/features/settings/be/store.ts';

const SETTINGS_ID = `${SETTINGS_ENTITY}-app` as EARS.EntityId;
const THREADS = 'default-setup/threads';

// A feature key is checked against the installed features with settings, so the store needs a pack registered to
// accept one — the same lookup the app uses (`getFeaturesWithSettings`)
const pack: PackRegistration = {
  id: 'default-setup',
  features: { threads: { plugin: { receives: [] }, settings: { plugins: { threads: { limit: 10, sort: 'newest' } } } } },
};
registry.registerPack(pack);
afterAll(() => registry.unregisterPack(pack.id));

/** The defaults the app composes: one registered section, and one feature's own settings */
const DEFAULTS = (): SettingsDocument => ({
  [PLUGINS_SECTION]: { [THREADS]: { limit: 10, sort: 'newest' } },
  general: { application: { hotkeys: {} } },
});

let store: ReturnType<typeof createSettingsStore>;

beforeEach(() => {
  resetTestData();
  store = createSettingsStore({ defaults: DEFAULTS });
});

/** What is on disk, past the store */
const rowData = () => (untypedQx(SETTINGS_ID).pickOne(['data']) as { data?: unknown } | undefined)?.data;

describe('what is stored and what is in effect', () => {
  it('creates the row on first read and stores nothing in it', () => {
    expect(store.getStored()).toEqual({});
    expect(rowData()).toEqual({});
  });

  it('merges the defaults under the stored changes', () => {
    store.setFeatureSetting(THREADS as never, ['sort'], 'oldest');

    expect(store.getFeatureSettings(THREADS as never)).toEqual({ limit: 10, sort: 'oldest' });
    // the row keeps only the change, so a changed default still applies to `limit`
    expect(store.getStored()).toEqual({ [PLUGINS_SECTION]: { [THREADS]: { sort: 'oldest' } } });
  });

  it('follows a default that changes for a key the user never set', () => {
    let limit = 10;
    const moving = createSettingsStore({ defaults: () => ({ [PLUGINS_SECTION]: { [THREADS]: { limit } }, general: {} }) });
    moving.setFeatureSetting(THREADS as never, ['sort'], 'oldest');

    limit = 50;
    expect(moving.getFeatureSettings(THREADS as never)).toEqual({ limit: 50, sort: 'oldest' });
  });

  it('answers a feature with no settings with an empty object', () => {
    expect(store.getFeatureSettings('default-setup/nothing' as never)).toEqual({});
  });

  it('reads a registered section', () => {
    expect(store.getSection('general')).toEqual({ application: { hotkeys: {} } });
  });
});

describe('the one writer', () => {
  it('refuses a section nothing registered, and stores nothing', () => {
    expect(() => store.setSectionValue('nope', ['x'], 1)).toThrow(SettingsRefusedError);
    expect(store.getStored()).toEqual({});
  });

  it('refuses a replacement whose feature key is not installed', () => {
    expect(() => store.replaceAll({ [PLUGINS_SECTION]: { 'gone/notes': { x: 1 } } })).toThrow(SettingsRefusedError);
    expect(store.getStored()).toEqual({});
  });

  it('carries the reasons on the refusal', () => {
    try {
      store.setSectionValue('nope', ['x'], 1);
      expect.unreachable('the write should have been refused');
    } catch (error) {
      expect((error as SettingsRefusedError).problems[0]).toContain("isn't a settings section");
    }
  });

  it('keeps only what a replacement changes from the defaults', () => {
    store.replaceAll({ [PLUGINS_SECTION]: { [THREADS]: { limit: 10, sort: 'oldest' } }, general: { application: { hotkeys: {} } } });

    expect(store.getStored()).toEqual({ [PLUGINS_SECTION]: { [THREADS]: { sort: 'oldest' } } });
  });

  it('removes a stored value so its default applies again, and does nothing when there is none', () => {
    store.setFeatureSetting(THREADS as never, ['sort'], 'oldest');
    const changes: unknown[] = [];
    store.onChange((change) => changes.push(change));

    store.removeStored([PLUGINS_SECTION, THREADS, 'missing']);
    expect(changes).toEqual([]); // nothing was there, so nothing was written

    store.removeStored([PLUGINS_SECTION, THREADS, 'sort']);
    expect(store.getFeatureSettings(THREADS as never)).toEqual({ limit: 10, sort: 'newest' });
    expect(changes).toEqual(['written']);
  });

  it('forgets every change on reset', () => {
    store.setFeatureSetting(THREADS as never, ['sort'], 'oldest');
    store.reset();

    expect(store.getStored()).toEqual({});
    expect(store.getFeatureSettings(THREADS as never)).toEqual({ limit: 10, sort: 'newest' });
  });
});

describe('naming a feature', () => {
  it('throws on a bare name, naming the ref it likely meant', () => {
    expect(() => store.featureRef('threads')).toThrow(/default-setup\/threads/);
  });
});

describe('listeners', () => {
  it('hears every write once, whoever made it', () => {
    const heard: string[] = [];
    store.onChange((change) => heard.push(change));

    store.setFeatureSetting(THREADS as never, ['sort'], 'oldest');
    store.setSectionValue('general', ['application', 'hotkeys', 'save'], 'mod+s');

    expect(heard).toEqual(['written', 'written']);
  });

  it('stops after the unsubscribe', () => {
    const heard: string[] = [];
    const off = store.onChange((change) => heard.push(change));
    off();

    store.reset();
    expect(heard).toEqual([]);
  });

  // The two that bracket a replacement have to arrive in order with the writes they enclose, which is why the
  // writer says them rather than whoever started the replacement
  it('brackets a replacement, with the writes it makes in between', async () => {
    const heard: string[] = [];
    store.onChange((change) => heard.push(change));

    await store.whileReplacingData(async () => {
      store.setFeatureSetting(THREADS as never, ['sort'], 'oldest');
    });

    expect(heard).toEqual(['replacing', 'written', 'replaced']);
  });

  it('says it ended even when the replacement throws', async () => {
    const heard: string[] = [];
    store.onChange((change) => heard.push(change));

    await expect(store.whileReplacingData(async () => { throw new Error('import failed'); })).rejects.toThrow('import failed');
    expect(heard).toEqual(['replacing', 'replaced']);
  });

  // A failed import may have migrated some data already, so nested replacements say it once, at the outermost
  it('says it once for nested replacements', async () => {
    const heard: string[] = [];
    store.onChange((change) => heard.push(change));

    await store.whileReplacingData(async () => {
      await store.whileReplacingData(async () => {});
    });

    expect(heard).toEqual(['replacing', 'replaced']);
  });

  it('does not let one listener throwing stop the row from being written', () => {
    store.onChange(() => { throw new Error('listener blew up'); });

    expect(() => store.setFeatureSetting(THREADS as never, ['sort'], 'oldest')).toThrow('listener blew up');
    expect(rowData()).toEqual({ [PLUGINS_SECTION]: { [THREADS]: { sort: 'oldest' } } });
  });
});

describe('ensure', () => {
  it('creates the row so nothing later has to', () => {
    const created = vi.fn();
    store.onChange(created);

    store.ensure();

    expect(rowData()).toEqual({});
    expect(created).not.toHaveBeenCalled(); // creating the row is not a change to the user's settings
  });
});
