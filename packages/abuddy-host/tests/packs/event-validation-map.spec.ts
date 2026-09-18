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

  it('is empty for a pack that declares none, so a send to its plugin is rejected rather than waved through', () => {
    registry.registerPack({ id: 'silent-pack', systems: [] });
    expect(registry.getPluginEventValidationMap().has('silent')).toBe(false);
    registry.unregisterPack('silent-pack');
  });
});
