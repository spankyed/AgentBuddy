// The boot seed's reading of a pack's seed manifest. A pack bundle carries this object compiled into its runtime,
// so one built against an older @abuddy/cli reaches a newer app with the field named as it was then.
import { describe, expect, it } from 'vitest';
import type { PackSeedManifest } from '@abuddy/sdk/framework';
import { orchestrateDeclarativeSeed } from '../../../src/packs/runtime/seed.ts';

describe('orchestrateDeclarativeSeed', () => {
  it('says to rebuild a pack whose seed manifest predates seedKeys, rather than seeding nothing', () => {
    // What `abuddy build` wrote when the field was called `artifacts`
    const old = { artifacts: ['actions', 'notes'], compiledDir: '/nowhere' } as unknown as PackSeedManifest;
    expect(() => orchestrateDeclarativeSeed(old, 'stale-pack')).toThrow(
      'Pack "stale-pack" was built with an older @abuddy/cli (its seed manifest has no seedKeys): rebuild it with the current one',
    );
  });

  it('says the same for a manifest with no keys at all', () => {
    const empty = { compiledDir: '/nowhere' } as unknown as PackSeedManifest;
    expect(() => orchestrateDeclarativeSeed(empty, 'odd-pack')).toThrow(/rebuild it with the current one/);
  });
});
