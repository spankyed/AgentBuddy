// What bus.send accepts: each registered system's incoming events, kept current by registration itself.
import { describe, expect, it } from 'vitest';
import { setup } from 'xstate';
import { createPackRegistry } from '../../src/packs/pack-registration.ts';

const { getEventValidationMap, registerHostSystem, registerPack, unregisterPack } = createPackRegistry();

const machine = setup({}).createMachine({});

describe('getEventValidationMap', () => {
  it('follows packs registering and unregistering, with no manual invalidation', () => {
    // Cached before the change
    expect(getEventValidationMap().has('validation-pack.feature')).toBe(false);

    registerPack({ id: 'validation-pack', systems: [{ id: 'validation-pack.feature', machine, events: new Set(['PING']) }] });
    expect(getEventValidationMap().get('validation-pack.feature')).toEqual(new Set(['PING']));

    unregisterPack('validation-pack');
    expect(getEventValidationMap().has('validation-pack.feature')).toBe(false);
  });

  it('follows host systems registering', () => {
    expect(getEventValidationMap().has('validation-host')).toBe(false);
    registerHostSystem('validation-host', machine, new Set(['HELLO']));
    expect(getEventValidationMap().get('validation-host')).toEqual(new Set(['HELLO']));
  });
});

describe('getPluginEventValidationMap', () => {
  const registry = createPackRegistry();

  it("starts with the host's own plugins, which no pack declares", () => {
    expect(registry.getPluginEventValidationMap().get('application')).toEqual(
      new Set(['CLIENT_CONNECTED', 'APPLICATION_HOTKEYS', 'APPLICATION_RESTORE_LAST_PLUGIN', 'PLUGIN_VISIBILITY_UPDATED']),
    );
  });

  it('follows packs registering and unregistering, with no manual invalidation', () => {
    expect(registry.getPluginEventValidationMap().has('memos')).toBe(false);

    registry.registerPack({ id: 'memo-pack', systems: [], receivedEventTypes: { memos: ['MEMO_ADDED', 'MEMOS_CONNECTED'] } });
    expect(registry.getPluginEventValidationMap().get('memos')).toEqual(new Set(['MEMO_ADDED', 'MEMOS_CONNECTED']));

    registry.unregisterPack('memo-pack');
    expect(registry.getPluginEventValidationMap().has('memos')).toBe(false);
  });

  // A pack built before receivedEventTypes existed still says which plugins are its own, through the
  // `features` codegen has always emitted. Its plugins map to null: known, but nothing to check against.
  it('maps a plugin of a pack that declared no event types to null, not to absent', () => {
    registry.registerPack({
      id: 'older-pack',
      systems: [{ id: 'older-pack.notes', machine, events: new Set(['PING']) }],
      features: [{ id: 'notes', hasSystem: true, hasPlugin: true, services: [] }],
    });
    expect(registry.getPluginEventValidationMap().has('notes')).toBe(true);
    expect(registry.getPluginEventValidationMap().get('notes')).toBeNull();
    registry.unregisterPack('older-pack');
  });

  it('leaves a plugin no registered pack owns absent, so a wrong id is still caught', () => {
    registry.registerPack({ id: 'silent-pack', systems: [] });
    expect(registry.getPluginEventValidationMap().has('silent')).toBe(false);
    registry.unregisterPack('silent-pack');
  });

  // An owned plugin its pack's systems send nothing to gets an empty set, not null: the pack declared,
  // so a send there is a mistake, not an unknown.
  it('gives an owned plugin with no declared events an empty set', () => {
    registry.registerPack({
      id: 'quiet-pack',
      systems: [],
      features: [{ id: 'quiet', hasSystem: false, hasPlugin: true, services: [] }],
      receivedEventTypes: {},
    });
    expect(registry.getPluginEventValidationMap().get('quiet')).toEqual(new Set());
    registry.unregisterPack('quiet-pack');
  });
});

// The map used to union every pack's receivedEventTypes into one set per plugin id, so any pack could
// add event types to any plugin — the host's included — whatever its own plugins were.
describe('a pack cannot widen a plugin it does not own', () => {
  const plugin = (id: string) => ({ id, hasSystem: false, hasPlugin: true, services: [] });

  // A pack owns what its features name and what it declares events for, so a hand-written registration
  // that gives only one of the two still has its plugins known
  it('owns the plugins its features name and the ones it declares events for', () => {
    const registry = createPackRegistry();
    registry.registerPack({
      id: 'both-pack',
      systems: [],
      features: [plugin('fromFeatures')],
      receivedEventTypes: { fromEvents: ['AN_EVENT'] },
    });
    const map = registry.getPluginEventValidationMap();
    expect(map.get('fromEvents')).toEqual(new Set(['AN_EVENT']));
    expect(map.get('fromFeatures')).toEqual(new Set());
  });

  it("cannot add event types to the host's plugin, because claiming its id is refused", () => {
    const registry = createPackRegistry();
    const host = registry.getPluginEventValidationMap().get('application');

    expect(() => registry.registerPack({
      id: 'impostor-pack',
      systems: [],
      features: [plugin('application')],
      receivedEventTypes: { application: ['ANYTHING'] },
    })).toThrow('Plugin collision: id "application" — pack "impostor-pack" vs the host\'s own "application" plugin');

    expect(registry.getPluginEventValidationMap().get('application')).toEqual(host);
  });

  // Shadowing used to be tolerated: the second pack installed with no UI and every send to the id reached
  // the first. The id is refused now, so what this pins is that the first owner's contract is untouched
  // cannot widen what the first declared.
  it("refuses a second pack claiming the id, leaving the first owner's event types", () => {
    const registry = createPackRegistry();
    registry.registerPack({
      id: 'first-pack', systems: [], features: [plugin('memos')], receivedEventTypes: { memos: ['MEMO_ADDED'] },
    });

    expect(() => registry.registerPack({
      id: 'second-pack', systems: [], features: [plugin('memos')], receivedEventTypes: { memos: ['HIJACKED'] },
    })).toThrow('Plugin collision: id "memos" — pack "second-pack" vs "first-pack"');

    expect(registry.getPluginEventValidationMap().get('memos')).toEqual(new Set(['MEMO_ADDED']));
  });
});

/**
 * Registering a pack's extensions is observable: settingsDefaults.register notifies its listeners,
 * and default-setup's settings system reacts by sending to its plugin. A send reaches the bus while it
 * is idle, so the bus checks it synchronously — inside registerPack. With the pack listed last, that
 * send was checked against a registry that did not yet contain the pack sending it.
 */
describe('a pack registering', () => {
  const plugin = (id: string) => ({ id, hasSystem: false, hasPlugin: true, services: [] });

  it('is listed before its extensions are registered, so a listener sees its plugins', () => {
    const registry = createPackRegistry();
    let seen: Set<string> | null | undefined = 'unset' as never;
    const stop = registry.onSettingsDefaultsChanged(() => {
      seen = registry.getPluginEventValidationMap().get('memos');
    });
    registry.registerPack({
      id: 'memo-pack',
      systems: [],
      features: [{ ...plugin('memos'), settings: { plugins: { memos: { sort: 'newest' } } } }],
      receivedEventTypes: { memos: ['MEMO_ADDED'] },
    });
    stop();
    expect(seen).toEqual(new Set(['MEMO_ADDED']));
  });

  // The rollback has to take it back out again, or a refused pack stays listed
  it('is unlisted again when its extensions are refused', () => {
    const registry = createPackRegistry();
    // Two seeders for one key: refused partway through registering the extensions
    expect(() => registry.registerPack({
      id: 'clumsy-pack',
      systems: [],
      features: [plugin('memos')],
      receivedEventTypes: { memos: ['MEMO_ADDED'] },
      seeders: [{ key: 'notes' } as never, { key: 'notes' } as never],
    })).toThrow('two seeders');
    expect(registry.getPluginEventValidationMap().has('memos')).toBe(false);
    expect(registry.getRegisteredPackSystemIds('clumsy-pack')).toEqual([]);
  });
});

describe('a host plugin', () => {
  it('is checked with the event types the host registers for it', () => {
    const registry = createPackRegistry();
    registry.registerHostPlugin('packs', ['PACKS_LIST', 'PACK_ACTIVATED']);
    expect(registry.getPluginEventValidationMap().get('packs')).toEqual(new Set(['PACKS_LIST', 'PACK_ACTIVATED']));
  });

  // Whichever order they register in, the host's declaration is the one that counts
  it("wins over a pack that registered the id first", () => {
    const registry = createPackRegistry();
    registry.registerPack({
      id: 'owner-pack', systems: [],
      features: [{ id: 'packs', hasSystem: false, hasPlugin: true, services: [] }],
      receivedEventTypes: { packs: ['NOT_THE_HOSTS'] },
    });
    registry.registerHostPlugin('packs', ['PACKS_LIST']);
    expect(registry.getPluginEventValidationMap().get('packs')).toEqual(new Set(['PACKS_LIST']));
  });
});
