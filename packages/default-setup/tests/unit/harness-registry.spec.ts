// The harness registers the pack in a registry of its own, one per test file, which the SDK's lookups read
import { describe, expect, it } from 'vitest';
import { registerPack, unregisterPack } from '@abuddy/testing/harness';
import { getDesignated } from '@abuddy/sdk/designations';
import { stepRegistry } from '@abuddy/sdk/steps';
import { services } from '@/__generated__/services';

describe("the test file's registry", () => {
  it('holds default-setup, registered once, which the lookups read', () => {
    expect(() => registerPack({ id: 'default-setup', systems: [] })).toThrow('Pack "default-setup" is already registered');
    expect(getDesignated('brain')).toBe('brain');
    expect(stepRegistry.has('llm')).toBe(true);
    expect(typeof services.library.commands).toBe('function');
  });

  it('takes other packs, which the lookups then see', () => {
    registerPack({
      id: 'journal-pack',
      systems: [{ id: 'journal-pack.journal', machine: {} as never, events: new Set() }],
      features: [{ id: 'journal', designation: 'journal', hasSystem: true, hasPlugin: false, services: [] }],
    });
    try {
      expect(getDesignated('journal')).toBe('journal-pack.journal');
    } finally {
      unregisterPack('journal-pack');
    }
    expect(() => getDesignated('journal')).toThrow('No feature designated for "journal"');
  });
});
