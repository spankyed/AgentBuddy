// The app's own state moves out of the built-in pack's settings: before 0.3.15 it was stored in the
// Settings row's `internal` section, which resetting settings erased.
import { untypedQx } from '@abuddy/ears';
import type { EARS } from '@abuddy/sdk';
import type { PackMigration } from '@abuddy/sdk/framework';
import { appState, type AppState } from '../../app-state/index.ts';
import type { PackRegistry } from '../../packs/pack-registration.ts';
import { getBuiltInPackInfos } from '../../packs/runtime/loader.ts';

/** The row the settings were stored in before 0.3.15 */
const LEGACY_SETTINGS_ID = 'Settings-app' as EARS.EntityId;

/** The settings' `internal` section, as versions before 0.3.15 stored it */
interface LegacyInternal {
  hasOnboarded?: boolean;
  version?: string;
  packVersions?: Record<string, string>;
  packSeedHashes?: Record<string, string>;
  /** The one built-in pack boot seed's hash, before it was recorded per pack */
  seedHash?: string;
  seedStatFingerprint?: string;
  seedHashes?: Record<string, string>;
  seedStatFingerprints?: Record<string, string>;
}

function legacyInternal(): LegacyInternal | undefined {
  const row = untypedQx(LEGACY_SETTINGS_ID).pickOne(['data']) as { data?: { internal?: LegacyInternal } } | undefined;
  return row?.data?.internal;
}

/** The built-in packs with a boot seed: the ones the single seed hash stood for */
const bootSeedPacks = (registry: Pick<PackRegistry, 'getPackRegistration'>): string[] =>
  getBuiltInPackInfos().map(({ id }) => id).filter((id) => registry.getPackRegistration(id)?.boot?.seedManifest);

/** A per-pack record with the stored one's entries it lacks */
const withMissing = (current: Record<string, string>, legacy: Record<string, string> | undefined) => ({ ...legacy, ...current });

/** The migration, over the app's registered packs */
export const migration = (registry: Pick<PackRegistry, 'getPackRegistration'>): PackMigration => ({
  target: '0.3.15',
  description: "Move the app's state (onboarding, versions, seed hashes) from the settings' internal section to AppState",
  up: () => {
    const internal = legacyInternal();
    if (!internal) return;
    const current = appState.get();

    // What a single seed hash recorded belongs to the built-in packs with a boot seed; without it the app would
    // forget it ever seeded and import the whole boot seed again
    const seedHashes = { ...internal.seedHashes };
    const seedStatFingerprints = { ...internal.seedStatFingerprints };
    for (const packId of bootSeedPacks(registry)) {
      if (internal.seedHash && !seedHashes[packId]) seedHashes[packId] = internal.seedHash;
      if (internal.seedStatFingerprint && !seedStatFingerprints[packId]) seedStatFingerprints[packId] = internal.seedStatFingerprint;
    }

    const moved: Partial<AppState> = {
      packVersions: withMissing(current.packVersions, internal.packVersions),
      packSeedHashes: withMissing(current.packSeedHashes, internal.packSeedHashes),
      seedHashes: withMissing(current.seedHashes, seedHashes),
      seedStatFingerprints: withMissing(current.seedStatFingerprints, seedStatFingerprints),
      // Onboarding, once finished, stays finished
      ...(internal.hasOnboarded && !current.hasOnboarded && { hasOnboarded: true }),
      // The version the data was migrated to decides which migrations still run: kept unless one is recorded
      ...(internal.version && current.version === undefined && { version: internal.version }),
    };
    // Only what differs is written, so running it again changes nothing
    const changed = Object.fromEntries(Object.entries(moved)
      .filter(([field, value]) => JSON.stringify(value) !== JSON.stringify(current[field as keyof AppState])));
    if (Object.keys(changed).length > 0) appState.update(changed);
  },
});
