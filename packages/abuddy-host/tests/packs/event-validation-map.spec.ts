// What bus.send accepts: each registered system's incoming events, kept current by registration itself.
import { describe, expect, it } from 'vitest';
import { setup } from 'xstate';
import type { PackFeature } from '@abuddy/sdk/framework';
import { createPackRegistry } from '../../src/packs/pack-registration.ts';
import { hostRegistration, PACKS_PLUGIN_EVENT_TYPES } from '../../src/packs/host-pack.ts';
import { PLUGIN_EVENT_TYPES } from '@abuddy/sdk/events';

/** The events a pack's plugin receives: what its pack declares, and what the app sends every plugin */
const receives = (...types: string[]) => new Set([...types, ...PLUGIN_EVENT_TYPES]);

const { getEventValidationMap, getRegisteredSystems, getEarlySystems, registerPack, unregisterPack } = createPackRegistry();

const machine = setup({}).createMachine({});

/** A feature with a plugin that receives `types` */
const plugin = (types: string[] = []): PackFeature => ({ plugin: { receives: types } });

describe('getEventValidationMap', () => {
  it('follows packs registering and unregistering, with no manual invalidation', () => {
    // Cached before the change
    expect(getEventValidationMap().has('validation-pack/feature')).toBe(false);

    registerPack({ id: 'validation-pack', features: { feature: { system: { machine, receives: ['PING'] } } } });
    expect(getEventValidationMap().get('validation-pack/feature')).toEqual(new Set(['PING']));

    unregisterPack('validation-pack');
    expect(getEventValidationMap().has('validation-pack/feature')).toBe(false);
  });

  // An early system starts outside the bus, but a client still sends to it: at its address, like any system
  it("checks a pack's early system at its address, and leaves starting it to the app", () => {
    registerPack({ id: 'early-pack', features: { logs: { system: { machine, receives: ['CLEAR_LOGS'], early: true } } } });
    try {
      expect(getEventValidationMap().get('early-pack/logs')).toEqual(new Set(['CLEAR_LOGS']));
      expect(getRegisteredSystems().has('early-pack/logs')).toBe(false);
      expect(getEarlySystems()).toEqual([{ id: 'early-pack/logs', machine }]);
    } finally {
      unregisterPack('early-pack');
    }
  });

  // The registry makes every ref `<packId>/<featureId>`, so a feature id naming another pack's feature is refused
  it('refuses a feature id that is not one segment', () => {
    expect(() => registerPack({ id: 'stray-pack', features: { 'other-pack/logs': { system: { machine, receives: [] } } } }))
      .toThrow(`Pack "stray-pack": feature "other-pack/logs" isn't a feature id`);
  });

  // The host is a pack like any other: its features' systems are checked the same way
  it("lists the host's systems once it registers", () => {
    expect(getEventValidationMap().has('host/application')).toBe(false);
    registerPack(hostRegistration({ application: { machine, receives: ['HELLO'] } }));
    expect(getEventValidationMap().get('host/application')).toEqual(new Set(['HELLO']));
    unregisterPack('host');
  });
});

describe('getPluginEventValidationMap', () => {
  const registry = createPackRegistry();

  it('follows packs registering and unregistering, with no manual invalidation', () => {
    expect(registry.getPluginEventValidationMap().has('memo-pack/memos')).toBe(false);

    registry.registerPack({ id: 'memo-pack', features: { memos: plugin(['MEMO_ADDED', 'MEMOS_CONNECTED']) } });
    expect(registry.getPluginEventValidationMap().get('memo-pack/memos')).toEqual(receives('MEMO_ADDED', 'MEMOS_CONNECTED'));

    registry.unregisterPack('memo-pack');
    expect(registry.getPluginEventValidationMap().has('memo-pack/memos')).toBe(false);
  });

  it('leaves a feature without a plugin absent, so a send to it is caught', () => {
    registry.registerPack({ id: 'silent-pack', features: { silent: { system: { machine, receives: [] } } } });
    expect(registry.getPluginEventValidationMap().has('silent-pack/silent')).toBe(false);
    registry.unregisterPack('silent-pack');
  });

  // A plugin its pack's systems send nothing to gets only the app's events: any other send there is a mistake
  it('gives a plugin with no declared events only the app\'s', () => {
    registry.registerPack({ id: 'quiet-pack', features: { quiet: plugin() } });
    expect(registry.getPluginEventValidationMap().get('quiet-pack/quiet')).toEqual(receives());
    registry.unregisterPack('quiet-pack');
  });
});

describe('a pack cannot widen a plugin it does not own', () => {
  // A pack names its own features, and the host is the pack `host`, so `application` in a manifest is this
  // pack's `application` feature and never the host's plugin.
  it("cannot add event types to the host's plugin, because a pack's feature is under its own pack", () => {
    const registry = createPackRegistry();
    const host = registry.getPluginEventValidationMap().get('host/application');

    registry.registerPack({ id: 'impostor-pack', features: { application: plugin(['ANYTHING']) } });

    expect(registry.getPluginEventValidationMap().get('host/application')).toEqual(host);
    expect(registry.getPluginEventValidationMap().get('impostor-pack/application')).toEqual(receives('ANYTHING'));
  });

  // Each pack's plugin has its own address, so neither can widen or shadow the other's contract
  it("gives a second pack naming the same feature its own entry, leaving the first's", () => {
    const registry = createPackRegistry();
    registry.registerPack({ id: 'first-pack', features: { memos: plugin(['MEMO_ADDED']) } });
    registry.registerPack({ id: 'second-pack', features: { memos: plugin(['HIJACKED']) } });

    expect(registry.getPluginEventValidationMap().get('first-pack/memos')).toEqual(receives('MEMO_ADDED'));
    expect(registry.getPluginEventValidationMap().get('second-pack/memos')).toEqual(receives('HIJACKED'));
  });
});

/**
 * Registering a pack's extensions is observable: settingsDefaults.register notifies its listeners,
 * and default-setup's settings system reacts by sending to its plugin. A send reaches the bus while it
 * is idle, so the bus checks it synchronously — inside registerPack. With the pack listed last, that
 * send was checked against a registry that did not yet contain the pack sending it.
 */
describe('a pack registering', () => {
  it('is listed before its extensions are registered, so a listener sees its plugins', () => {
    const registry = createPackRegistry();
    let seen: Set<string> | undefined = 'unset' as never;
    const stop = registry.onSettingsDefaultsChanged(() => {
      seen = registry.getPluginEventValidationMap().get('memo-pack/memos');
    });
    registry.registerPack({
      id: 'memo-pack',
      features: { memos: { ...plugin(['MEMO_ADDED']), settings: { plugins: { memos: { sort: 'newest' } } } } },
    });
    stop();
    expect(seen).toEqual(receives('MEMO_ADDED'));
  });

  // The rollback has to take it back out again, or a refused pack stays listed
  it('is unlisted again when its extensions are refused', () => {
    const registry = createPackRegistry();
    // Two seeders for one key: refused partway through registering the extensions
    expect(() => registry.registerPack({
      id: 'clumsy-pack',
      features: { memos: plugin(['MEMO_ADDED']) },
      seeders: [{ key: 'notes' } as never, { key: 'notes' } as never],
    })).toThrow('two seeders');
    expect(registry.getPluginEventValidationMap().has('clumsy-pack/memos')).toBe(false);
    expect(registry.getRegisteredPackSystemIds('clumsy-pack')).toEqual([]);
  });
});

describe('a host plugin', () => {
  it('is checked with the event types its registration declares', () => {
    const registry = createPackRegistry();
    registry.registerPack(hostRegistration());
    expect(registry.getPluginEventValidationMap().get('host/packs')).toEqual(receives(...PACKS_PLUGIN_EVENT_TYPES));
    expect(registry.getPluginEventValidationMap().get('host/application')).toEqual(receives('CLIENT_CONNECTED', 'APPLICATION_HOTKEYS', 'PLUGIN_VISIBILITY_UPDATED'));
  });

  // The host is the pack `host`, so a pack with a `packs` feature of its own is not a contest
  it("keeps its ref whatever a pack names its own feature", () => {
    const registry = createPackRegistry();
    registry.registerPack({ id: 'owner-pack', features: { packs: plugin(['NOT_THE_HOSTS']) } });
    registry.registerPack(hostRegistration());
    expect(registry.getPluginEventValidationMap().get('host/packs')).toEqual(receives(...PACKS_PLUGIN_EVENT_TYPES));
    expect(registry.getPluginEventValidationMap().get('owner-pack/packs')).toEqual(receives('NOT_THE_HOSTS'));
  });
});
