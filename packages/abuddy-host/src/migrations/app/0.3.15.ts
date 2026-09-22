// The app's own state moves out of the built-in pack's settings: before 0.3.15 it was stored in the
// Settings row's `internal` section, which resetting settings erased. And every pack's stored plugin settings move
// onto their plugins' refs, before any pack's own migration reads them.
import { tx, untypedQx } from '@abuddy/ears';
import type { EARS } from '@abuddy/sdk';
import type { PackMigration } from '@abuddy/sdk/framework';
import { splitRef, type FeatureRef } from '@abuddy/sdk/ids';
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
  description: "Move the app's state (onboarding, versions, seed hashes) from the settings' internal section to AppState, the app shell's state from the settings' _meta to AppState, and every pack's plugin settings onto their plugins' refs",
  up: () => {
    moveAppState(registry);
    moveShellState(registry);
    // Every pack's plugin settings too, the built-in packs' included, before any pack's migration reads them
    movePluginSettings(registry);
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

/** What the settings row held before 0.3.15 under `plugins._meta`: the app shell's state, by bare plugin id */
interface LegacyShellState {
  visibility?: Record<string, unknown>;
  lastActivePlugin?: unknown;
}

/** Among which plugins a stored bare id is looked up, and whose plugin wins a feature id several share */
export interface PluginOwners {
  refs: readonly FeatureRef[];
  /** The built-in packs, which registered first: a bare id a built-in plugin shares with another pack's was its */
  builtIn: readonly string[];
}

const ownersIn = (registry: MigrationRegistry): PluginOwners => ({
  refs: registry.pluginIds(),
  builtIn: registry.builtInPacks().map(({ id }) => id),
});

/** Each bare feature id to its owner's ref, or null when no single one owns it (two external packs share it) */
function ownersOf({ refs, builtIn }: PluginOwners): Map<string, FeatureRef | null> {
  const byFeature = new Map<string, FeatureRef[]>();
  for (const ref of refs) {
    const parts = splitRef(ref);
    if (parts) byFeature.set(parts.featureId, [...(byFeature.get(parts.featureId) ?? []), ref]);
  }
  const owners = new Map<string, FeatureRef | null>();
  for (const [featureId, candidates] of byFeature) {
    const builtInOnes = candidates.filter((ref) => builtIn.includes(splitRef(ref)!.packId));
    owners.set(featureId, candidates.length === 1 ? candidates[0] : builtInOnes.length === 1 ? builtInOnes[0] : null);
  }
  return owners;
}

/** The plugin a stored id stands for: itself when it is one, else the owner of the bare feature id */
export function pluginRefOf(id: string, owners: PluginOwners): FeatureRef | undefined {
  if ((owners.refs as readonly string[]).includes(id)) return id as FeatureRef;
  return ownersOf(owners).get(id) ?? undefined;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** `over` laid on `under`: nested objects merge, and anywhere else `over` wins */
function mergeUnder(under: unknown, over: unknown): unknown {
  if (!isRecord(under) || !isRecord(over)) return over;
  const merged: Record<string, unknown> = { ...under };
  for (const [key, value] of Object.entries(over)) merged[key] = key in under ? mergeUnder(under[key], value) : value;
  return merged;
}

/**
 * A record keyed by plugin with every key a bare feature id stands for moved onto its owner's ref; a key no plugin
 * owns stays. A bare key and its ref both holding a value merge, the ref's winning wherever both set one. When nothing
 * moves, `record` comes back as it was, so a second run changes nothing.
 */
export function addressPluginKeys<T extends Record<string, unknown>>(record: T, owners: PluginOwners): { record: T; moved: number } {
  const ownerOf = ownersOf(owners);
  const next: Record<string, unknown> = { ...record };
  let moved = 0;
  for (const key of Object.keys(record)) {
    const ref = ownerOf.get(key);
    if (!ref) continue;
    next[ref] = ref in next ? mergeUnder(record[key], next[ref]) : record[key];
    delete next[key];
    moved++;
  }
  return moved === 0 ? { record, moved } : { record: next as T, moved };
}

/**
 * The app shell's state out of the built-in pack's settings (`plugins._meta`) into AppState: which plugins' tabs
 * the user showed or hid, and the plugin last open, each onto its plugin's ref; an id no registered plugin owns is
 * dropped. What AppState already records wins.
 */
function moveShellState(registry: MigrationRegistry): void {
  const data = (untypedQx(SETTINGS_ID).pickOne(['data']) as { data?: { plugins?: Record<string, unknown> } } | undefined)?.data;
  const meta = data?.plugins?._meta as LegacyShellState | undefined;
  if (!data?.plugins || meta === undefined) return;
  const owners = ownersIn(registry);

  const visibility = Object.fromEntries(Object.entries(addressPluginKeys(meta.visibility ?? {}, owners).record)
    .filter(([ref, visible]) => owners.refs.includes(ref as FeatureRef) && typeof visible === 'boolean')) as Record<string, boolean>;
  const lastActive = typeof meta.lastActivePlugin === 'string' ? pluginRefOf(meta.lastActivePlugin, owners) : undefined;
  const current = appState.get();
  appState.update({
    pluginVisibility: { ...visibility, ...current.pluginVisibility },
    ...(lastActive && current.lastActivePlugin === undefined && { lastActivePlugin: lastActive }),
  });

  const { _meta, ...plugins } = data.plugins;
  tx(SETTINGS_ID).put('data', { ...data, plugins });
}

/** Every pack's plugin settings, stored under their features' bare ids before 0.3.15, onto their refs */
function movePluginSettings(registry: MigrationRegistry): void {
  const data = (untypedQx(SETTINGS_ID).pickOne(['data']) as { data?: { plugins?: Record<string, unknown> } } | undefined)?.data;
  if (!data?.plugins) return;
  const { record: plugins, moved } = addressPluginKeys(data.plugins, ownersIn(registry));
  if (moved > 0) tx(SETTINGS_ID).put('data', { ...data, plugins });
}
