// The app's own state moves out of the built-in pack's settings: before 0.3.15 it was stored in the
// Settings row's `internal` section, which resetting settings erased. And installed external packs' stored
// plugin settings move onto their plugins' addresses, which no pack's own migration can do for them.
import { tx, untypedQx } from '@abuddy/ears';
import type { EARS } from '@abuddy/sdk';
import { addressPluginSettings, type PackMigration } from '@abuddy/sdk/framework';
import { parseAddress } from '@abuddy/sdk/ids';
import { appState, type AppState } from '../../app-state/index.ts';
import type { PackRegistry } from '../../packs/pack-registration.ts';

/** The settings row: where the app's state was stored before 0.3.15, and where the plugin settings still are */
const SETTINGS_ID = 'Settings-app' as EARS.EntityId;

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
  const row = untypedQx(SETTINGS_ID).pickOne(['data']) as { data?: { internal?: LegacyInternal } } | undefined;
  return row?.data?.internal;
}

/** The built-in packs with a boot seed: the ones the single seed hash stood for */
const bootSeedPacks = (registry: Pick<PackRegistry, 'getPackRegistration' | 'builtInPacks'>): string[] =>
  registry.builtInPacks().map(({ id }) => id).filter((id) => registry.getPackRegistration(id)?.boot?.seedManifest);

/** A per-pack record with the stored one's entries it lacks */
const withMissing = (current: Record<string, string>, legacy: Record<string, string> | undefined) => ({ ...legacy, ...current });

type MigrationRegistry = Pick<PackRegistry, 'getPackRegistration' | 'builtInPacks' | 'externalPacks' | 'pluginIds'>;

/** The migration, over the app's registered packs */
export const migration = (registry: MigrationRegistry): PackMigration => ({
  target: '0.3.15',
  description: "Move the app's state (onboarding, versions, seed hashes) from the settings' internal section to AppState, and external packs' plugin settings onto their plugins' addresses",
  up: () => {
    moveAppState(registry);
    addressExternalPluginSettings(registry);
  },
});

function moveAppState(registry: MigrationRegistry): void {
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
}

/**
 * An installed external pack's plugin settings, sidebar visibility and last-active plugin, stored under its
 * features' bare ids before 0.3.15, onto its plugins' addresses. The built-in packs move their own in their
 * migrations, and a bare id a built-in pack also has a feature by is theirs: the built-in plugin ran under it.
 * A pack that isn't loaded when this runs (disabled) keeps its bare keys.
 */
function addressExternalPluginSettings(registry: MigrationRegistry): void {
  const external = new Set(registry.externalPacks().map(({ id }) => id));
  if (external.size === 0) return;
  const data = (untypedQx(SETTINGS_ID).pickOne(['data']) as { data?: { plugins?: Record<string, unknown> } } | undefined)?.data;
  if (!data?.plugins) return;
  const plugins = registry.pluginIds().flatMap((address) => {
    const parsed = parseAddress(address);
    return parsed ? [{ address, ...parsed }] : [];
  });
  const builtInFeatures = new Set(plugins.filter(({ packId }) => !external.has(packId)).map(({ featureId }) => featureId));
  const addresses = plugins
    .filter(({ packId, featureId }) => external.has(packId) && !builtInFeatures.has(featureId))
    .map(({ address }) => address);
  const moved = addressPluginSettings(data.plugins, addresses);
  if (moved.moved > 0) tx(SETTINGS_ID).put('data', { ...data, plugins: moved.plugins });
}
