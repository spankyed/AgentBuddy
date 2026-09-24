// The app's own state moves out of the built-in pack's settings: before 0.3.15 it was stored in the
// Settings row's `internal` section, which resetting settings erased. And every pack's stored plugin settings move
// onto their plugins' refs, before any pack's own migration reads them.
import { untypedTx, untypedQx } from '@abuddy/ears';
import type { EARS } from '@abuddy/sdk';
import type { PackMigration } from '@abuddy/sdk/framework';
import { HOST_PACK_ID, splitRef, type FeatureRef } from '@abuddy/sdk/ids';
import { HOST } from '../../refs.ts';
import { resolveAppContext } from '@abuddy/sdk/env';
import type { PackManifest } from '@abuddy/sdk/build';
import { appState, type AppState } from '../../app-state/index.ts';
import type { PackRegistry } from '../../packs/registry.ts';
import { discoverPacks } from '../../packs/discovery.ts';
import { deepMerge, isPlainObject } from '@abuddy/sdk/utils/pure';

/** The settings row: where the app's state was stored before 0.3.15, and where the plugin settings still are */
const SETTINGS_ID = 'Settings-app' as EARS.EntityId;

/** The app's state row, addressed here because the rename below reads fields `appState` no longer knows */
const APP_STATE_ID = 'AppState-app' as EARS.EntityId;

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

/** The settings row's data as stored, read untyped: it's in the shape from before 0.3.15 */
function storedSettings(): { internal?: LegacyInternal; plugins?: Record<string, unknown> } | undefined {
  return (untypedQx(SETTINGS_ID).pickOne(['data']) as { data?: ReturnType<typeof storedSettings> } | undefined)?.data;
}

function legacyInternal(): LegacyInternal | undefined {
  return storedSettings()?.internal;
}

/** The built-in packs with a boot seed: the ones the single seed hash stood for */
const bootSeedPacks = (registry: Pick<PackRegistry, 'getPackRegistration' | 'builtInPacks'>): string[] =>
  registry.builtInPacks().map(({ id }) => id).filter((id) => registry.getPackRegistration(id)?.boot?.seedManifest);

/** A per-pack record with the stored one's entries it lacks */
const withMissing = (current: Record<string, string>, legacy: Record<string, string> | undefined) => ({ ...legacy, ...current });

type MigrationRegistry = Pick<PackRegistry, 'getPackRegistration' | 'builtInPacks' | 'externalPacks' | 'pluginIds' | 'systemIds'>;

/** The manifests of the external packs installed on disk, whether or not they loaded this boot */
export type InstalledManifests = () => ReadonlyArray<Pick<PackManifest, 'id' | 'features'>>;

const installedOnDisk: InstalledManifests = () => discoverPacks(resolveAppContext().packsDir).map(({ manifest }) => manifest);

/**
 * The migration, over the app's registered packs and the external packs installed on disk. The installed ones count
 * because it runs once: a pack disabled at that boot, or one whose old build doesn't load, would otherwise keep its
 * keys bare for good, where nothing reads them.
 */
export const migration = (registry: MigrationRegistry, installed: InstalledManifests = installedOnDisk): PackMigration => ({
  target: '0.3.15',
  description: "Move the app's state (onboarding, versions, seed hashes) from the settings' internal section to AppState, the app shell's state from the settings' _meta to AppState, and every pack's plugin settings onto their plugins' refs",
  up: () => {
    renameSeedRecords();
    moveAppState(registry);
    const owners = ownersIn(registry, installed());
    moveShellState(owners);
    // Every pack's plugin settings too, the built-in packs' included, before any pack's migration reads them
    movePluginSettings(owners);
  },
});

/**
 * AppState's four per-pack seed records, renamed for the axis that tells them apart. They were `packSeedHashes` and
 * `packSeedDeps` for external packs against `seedHashes` and `seedStatFingerprints` for built-in ones — told apart by
 * the word `pack`, which cannot tell them apart, since built-in packs are packs. `appState` reads only the names it
 * knows, so data written under the old ones is invisible to it and the app would re-import every seed once.
 */
const RENAMED_SEED_RECORDS = {
  packSeedHashes: 'externalSeedHashes',
  packSeedDeps: 'externalSeedDeps',
  seedHashes: 'builtInSeedHashes',
  seedStatFingerprints: 'builtInSeedFingerprints',
} as const satisfies Record<string, keyof AppState>;

/** Moves each old-named record onto its new field, keeping what the new one already holds. Idempotent: the old names
 *  are removed as they move, so a second run finds nothing. */
function renameSeedRecords(): void {
  const old = Object.keys(RENAMED_SEED_RECORDS);
  const row = untypedQx(APP_STATE_ID).pickOne(old) as Record<string, Record<string, string> | null | undefined> | undefined;
  if (!row) return;

  const current = appState.get();
  const moved: Partial<AppState> = {};
  const tx = untypedTx(APP_STATE_ID);
  let any = false;
  for (const [from, to] of Object.entries(RENAMED_SEED_RECORDS)) {
    const value = row[from];
    // `drop` leaves the attribute as null rather than removing the key, so null is "already moved"
    if (value == null) continue;
    moved[to] = withMissing(current[to], value);
    tx.drop(from);
    any = true;
  }
  if (!any) return;
  appState.update(moved);
}

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
    externalSeedHashes: withMissing(current.externalSeedHashes, internal.packSeedHashes),
    builtInSeedHashes: withMissing(current.builtInSeedHashes, seedHashes),
    builtInSeedFingerprints: withMissing(current.builtInSeedFingerprints, seedStatFingerprints),
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

/**
 * The tab visibility 0.3.14 shipped as its defaults, by bare plugin id. 0.3.14 stored the whole default settings
 * with the user's changes merged in, so every row holds all of these whether or not the user chose them; an entry
 * still at its default is no choice, and moving it would pin today's default for good. 0.3.14 stored no default
 * `lastActivePlugin`: one stored is the plugin the user last opened.
 */
const DEFAULT_VISIBILITY_0314: Readonly<Record<string, boolean>> = {
  threads: true, code: true, library: false, flows: false, actions: false, prompts: false, brain: false,
  database: false, logs: false, browser: false, notes: false, settings: true,
};

/** Among which features a stored bare id is looked up, and whose feature wins an id several share */
export interface PluginOwners {
  refs: readonly FeatureRef[];
  /**
   * The host and the built-in packs, whose plugins registered first under bare ids: a bare id one of them shares with
   * an external pack's feature was its
   */
  builtIn: readonly string[];
}

/**
 * Every feature a stored key could belong to: each registered system and plugin, the host's included, and every
 * feature an installed pack's manifest lists. A feature with settings and no plugin kept them under its id too.
 */
function ownersIn(registry: MigrationRegistry, installed: ReturnType<InstalledManifests>): PluginOwners {
  const declared = installed.flatMap(declaredFeatureRefs);
  // The bus is listed among the systems but is no feature: it never had settings or a plugin, so it owns no key
  const refs = [...new Set<string>([...registry.pluginIds(), ...registry.systemIds(), ...declared])]
    .filter((ref) => splitRef(ref) && ref !== HOST.bus);
  return { refs: refs as FeatureRef[], builtIn: [HOST_PACK_ID, ...registry.builtInPacks().map(({ id }) => id)] };
}

/**
 * The refs of the features a manifest on disk lists. Read as data, not trusted as a manifest: a malformed one lists
 * none rather than throwing, because a thrown migration stops every boot's migrations and seeds until it is fixed, and
 * one broken pack on disk mustn't do that to the app. Its keys stay as they are.
 */
function declaredFeatureRefs(manifest: { id?: unknown; features?: unknown }): string[] {
  if (typeof manifest.id !== 'string' || !Array.isArray(manifest.features)) return [];
  return manifest.features.flatMap((feature: { id?: unknown } | null) =>
    typeof feature?.id === 'string' ? [`${manifest.id}/${feature.id}`] : []);
}

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
    next[ref] = ref in next ? deepMerge(record[key], next[ref]) : record[key];
    delete next[key];
    moved++;
  }
  return moved === 0 ? { record, moved } : { record: next as T, moved };
}

/**
 * The app shell's state out of the built-in pack's settings (`plugins._meta`) into AppState: which plugins' tabs
 * the user showed or hid, and the plugin last open, each onto its plugin's ref; an id no installed pack has is
 * dropped, as is a tab still at 0.3.14's default. What AppState already records wins.
 */
function moveShellState(owners: PluginOwners): void {
  const data = storedSettings();
  const meta = data?.plugins?._meta as LegacyShellState | undefined;
  if (!data?.plugins || meta === undefined) return;

  const chosen = Object.fromEntries(Object.entries(meta.visibility ?? {}).filter(([id, visible]) => DEFAULT_VISIBILITY_0314[id] !== visible));
  const visibility = Object.fromEntries(Object.entries(addressPluginKeys(chosen, owners).record)
    .filter(([ref, visible]) => owners.refs.includes(ref as FeatureRef) && typeof visible === 'boolean')) as Record<string, boolean>;
  const lastActive = typeof meta.lastActivePlugin === 'string' ? pluginRefOf(meta.lastActivePlugin, owners) : undefined;
  const current = appState.get();
  appState.update({
    pluginVisibility: { ...visibility, ...current.pluginVisibility },
    ...(lastActive && current.lastActivePlugin === undefined && { lastActivePlugin: lastActive }),
  });

  const { _meta, ...plugins } = data.plugins;
  untypedTx(SETTINGS_ID).put('data', { ...data, plugins });
}

/**
 * Every pack's plugin settings, stored under their features' bare ids before 0.3.15, onto their refs. A bare key no
 * installed pack owns, or that two external packs share, is dropped: the app reads plugin settings only by ref, so it
 * would sit where nothing reads it and fail every save of the settings that carried it back.
 */
function movePluginSettings(owners: PluginOwners): void {
  const data = storedSettings();
  if (!data?.plugins) return;
  const addressed = addressPluginKeys(data.plugins, owners).record;
  const plugins = Object.fromEntries(Object.entries(addressed).filter(([key]) => splitRef(key)));
  if (addressed !== data.plugins || Object.keys(plugins).length !== Object.keys(addressed).length) {
    untypedTx(SETTINGS_ID).put('data', { ...data, plugins });
  }
}
