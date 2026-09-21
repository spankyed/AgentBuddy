// The app's own state moves out of the built-in pack's settings: before 0.3.15 it was stored in the
// Settings row's `internal` section, which resetting settings erased. And installed external packs' stored
// plugin settings move onto their plugins' addresses, which no pack's own migration can do for them.
import { tx, untypedQx } from '@abuddy/ears';
import type { EARS } from '@abuddy/sdk';
import { addressPluginKeys, pluginRefOf, type PackMigration, type PluginOwners } from '@abuddy/sdk/framework';
import { HOST_PACK_ID, splitRef, type FeatureRef } from '@abuddy/sdk/ids';
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
  description: "Move the app's state (onboarding, versions, seed hashes) from the settings' internal section to AppState, the app shell's state from the settings' _meta to AppState, and the host's and external packs' plugin settings onto their plugins' refs",
  up: () => {
    moveAppState(registry);
    moveShellState(registry);
    addressHostAndExternalPluginSettings(registry);
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

/** Whose a stored bare id is, among every registered plugin, a built-in pack's winning a shared one (`PluginOwners`) */
const ownersIn = (registry: MigrationRegistry): PluginOwners => ({
  refs: registry.pluginIds(),
  builtIn: registry.builtInPacks().map(({ id }) => id),
});

/** What the settings row held before 0.3.15 under `plugins._meta`: the app shell's state, by bare plugin id */
interface LegacyShellState {
  visibility?: Record<string, unknown>;
  lastActivePlugin?: unknown;
}

/**
 * The app shell's state out of the built-in pack's settings (`plugins._meta`) into AppState: which plugins' tabs
 * the user showed or hid, and the plugin last open, each onto its plugin's ref. An id naming no registered
 * plugin (one since removed) is dropped: nothing could show it. What AppState already records wins.
 */
function moveShellState(registry: MigrationRegistry): void {
  const data = (untypedQx(SETTINGS_ID).pickOne(['data']) as { data?: { plugins?: Record<string, unknown> } } | undefined)?.data;
  const meta = data?.plugins?._meta as LegacyShellState | undefined;
  if (!data?.plugins || meta === undefined) return;
  const owners = ownersIn(registry);

  const visibility = Object.fromEntries(Object.entries(addressPluginKeys(meta.visibility ?? {}, owners).record)
    .filter(([ref, visible]) => owners.refs!.includes(ref as FeatureRef) && typeof visible === 'boolean')) as Record<string, boolean>;
  const lastActive = typeof meta.lastActivePlugin === 'string' ? pluginRefOf(meta.lastActivePlugin, owners) : undefined;
  const current = appState.get();
  appState.update({
    pluginVisibility: { ...visibility, ...current.pluginVisibility },
    ...(lastActive && current.lastActivePlugin === undefined && { lastActivePlugin: lastActive }),
  });

  const { _meta, ...plugins } = data.plugins;
  tx(SETTINGS_ID).put('data', { ...data, plugins });
}

/**
 * The plugin settings of the host's plugins (`host/packs`) and of installed external packs, stored under the
 * features' bare ids before 0.3.15, onto their refs. The built-in packs move their own in their migrations. A
 * pack that isn't loaded when this runs (disabled) keeps its bare keys.
 */
function addressHostAndExternalPluginSettings(registry: MigrationRegistry): void {
  const data = (untypedQx(SETTINGS_ID).pickOne(['data']) as { data?: { plugins?: Record<string, unknown> } } | undefined)?.data;
  if (!data?.plugins) return;
  // The built-in packs' own keys are theirs to move, in their migrations
  const moved = addressPluginKeys(data.plugins, { ...ownersIn(registry), movesTo: (_ref, { builtIn }) => !builtIn });
  if (moved.moved > 0) tx(SETTINGS_ID).put('data', { ...data, plugins: moved.record });
}
