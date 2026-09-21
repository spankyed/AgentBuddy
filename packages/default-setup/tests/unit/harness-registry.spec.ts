// The harness registers the pack in a registry of its own, one per test file, which the SDK's lookups read
import { describe, expect, it } from 'vitest';
import { registerPack, startApp, unregisterPack } from '@abuddy/testing/harness';
import { getDesignated } from '@abuddy/sdk/designations';
import { stepRegistry } from '@abuddy/sdk/steps';
import { services } from '@/__generated__/services';

describe("the test file's registry", () => {
  it('holds default-setup, registered once, which the lookups read', () => {
    expect(() => registerPack({ id: 'default-setup' })).toThrow('Pack "default-setup" is already registered');
    expect(getDesignated('brain')).toBe('default-setup/brain');
    expect(stepRegistry.has('llm')).toBe(true);
    expect(typeof services.library.commands).toBe('function');
  });

  it('takes other packs, which the lookups then see', () => {
    registerPack({
      id: 'journal-pack',
      features: { journal: { designation: 'journal', system: { machine: {} as never, receives: [] } } },
    });
    try {
      expect(getDesignated('journal')).toBe('journal-pack/journal');
    } finally {
      unregisterPack('journal-pack');
    }
    expect(() => getDesignated('journal')).toThrow('No feature designated for "journal"');
  });
});

// A plugin name nothing is registered under fails at once, naming the plugins there are, rather than as a wait
// for its events timing out
describe('a test app given a plugin name', () => {
  it('refuses one no plugin is registered under', async () => {
    const app = await startApp({ systems: ['settings'] });
    expect(() => app.emitted('setings')).toThrow('No registered plugin is named "setings" (it would be "default-setup/setings")');
    const started = Date.now();
    await expect(app.nextEmit('setings', 'SETTINGS_LOADED')).rejects.toThrow('No registered plugin is named "setings"');
    expect(Date.now() - started).toBeLessThan(1000);
  });
});
