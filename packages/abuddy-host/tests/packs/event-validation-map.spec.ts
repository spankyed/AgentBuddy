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
