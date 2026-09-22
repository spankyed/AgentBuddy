// The features whose plugin settings may be written: every installed feature that declares settings. A registered
// pack's come from its registration, in memory (featuresWithSettings); a pack installed but not running (disabled, or
// one that didn't load) keeps its settings, so installedFeaturesWithSettings adds its features from its manifest on disk.
import { describe, expect, it } from 'vitest';
import type { PackRegistration } from '@abuddy/sdk/framework';
import { createPackRegistry, type InstalledManifest } from '../../src/packs/pack-registration.ts';

const memoPack: PackRegistration = {
  id: 'memo-pack',
  features: {
    memos: { plugin: { receives: [] }, settings: { plugins: { memos: { sort: 'new' } } } },
    // No settings: nothing may be written for it
    board: { plugin: { receives: [] } },
  },
};

describe('featuresWithSettings and installedFeaturesWithSettings', () => {
  it("lists a registered pack's features that declare settings", () => {
    const registry = createPackRegistry();
    registry.registerPack(memoPack);

    expect(registry.featuresWithSettings()).toEqual(['memo-pack/memos']);
    expect(registry.installedFeaturesWithSettings()).toEqual(['memo-pack/memos']);

    registry.unregisterPack('memo-pack');
    expect(registry.featuresWithSettings()).toEqual([]);
  });

  it("adds an installed pack's features from its manifest while it isn't registered, and reads a malformed one as none", () => {
    let installed: InstalledManifest[] = [
      { id: 'memo-pack', features: [{ id: 'memos', settings: 'src/features/memos/settings.ts' }, { id: 'board' }] },
      { id: 'idle-pack', features: [{ id: 'idle', settings: 'src/settings.ts' }] },
      { id: 'broken-pack', features: { idle: {} } },
      { id: 7, features: [] },
    ];
    let reads = 0;
    const registry = createPackRegistry({ installedManifests: () => { reads++; return installed; } });

    expect(registry.installedFeaturesWithSettings()).toEqual(['memo-pack/memos', 'idle-pack/idle']);
    // The registered features alone are answered from memory
    expect(registry.featuresWithSettings()).toEqual([]);
    expect(reads).toBe(1);

    // Registered, its registration is what counts; read again on each call, so an uninstall shows at once
    registry.registerPack({ ...memoPack, features: { board: { plugin: { receives: [] }, settings: {} } } });
    installed = installed.filter(({ id }) => id !== 'idle-pack');
    expect(registry.installedFeaturesWithSettings()).toEqual(['memo-pack/board']);
  });
});
