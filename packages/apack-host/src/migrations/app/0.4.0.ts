// The app's own state moves out of the built-in pack's settings: before 0.4.0 it was stored in the
// Settings row's `internal` section, which resetting settings erased. And every pack's stored plugin settings move
// onto their plugins' refs, before any pack's own migration reads them.
import { untypedTx, untypedQx } from '@apack/ears';
import type { EARS } from '@apack/sdk';
import type { PackMigration } from '@apack/sdk/framework';
import { HOST_PACK_ID, splitRef, type FeatureRef } from '@apack/sdk/ids';
import { HOST } from '../../refs.ts';
import { resolveAppContext } from '@apack/sdk/env';
import type { PackManifest } from '@apack/sdk/build';
import { appState, type AppState } from '../../app-state/index.ts';
import type { PackRegistry } from '../../packs/registry.ts';
import { discoverPacks } from '../../packs/discovery.ts';
import { deepMerge } from '@apack/sdk/utils/pure';

/** The settings row: where the app's state was stored before 0.4.0, and where the plugin settings still are */
const SETTINGS_ID = 'Settings-app' as EARS.EntityId;

/** The app's state row, addressed here because the rename below reads fields `appState` no longer knows */
const APP_STATE_ID = 'AppState-app' as EARS.EntityId;

/** The settings' `internal` section, as versions before 0.4.0 stored it */
interface LegacyInternal {
  hasOnboarded?: boolean;
  version?: string;
  packVersions?: Record<string, string>;
}

/** The settings row's data as stored, read untyped: it's in the shape from before 0.4.0 */
function storedSettings(): { internal?: LegacyInternal; plugins?: Record<string, unknown> } | undefined {
  return (untypedQx(SETTINGS_ID).pickOne(['data']) as { data?: ReturnType<typeof storedSettings> } | undefined)?.data;
}

function legacyInternal(): LegacyInternal | undefined {
  return storedSettings()?.internal;
}

/** A per-pack record with the stored one's entries it lacks */
const withMissing = (current: Record<string, string>, legacy: Record<string, string> | undefined) => ({ ...legacy, ...current });

type MigrationRegistry = Pick<PackRegistry, 'getPackRegistration' | 'shippedPacks' | 'loadedPacks' | 'pluginIds' | 'systemIds'>;

/** The manifests of the external packs installed on disk, whether or not they loaded this boot */
export type InstalledManifests = () => ReadonlyArray<Pick<PackManifest, 'id' | 'features'>>;

const installedOnDisk: InstalledManifests = () => discoverPacks(resolveAppContext().packsDir).map(({ manifest }) => manifest);

/**
 * The migration, over the app's registered packs and the external packs installed on disk. The installed ones count
 * because it runs once: a pack disabled at that boot, or one whose old build doesn't load, would otherwise keep its
 * keys bare for good, where nothing reads them.
 */
export const migration = (registry: MigrationRegistry, installed: InstalledManifests = installedOnDisk): PackMigration => ({
  target: '0.4.0',
  description: "Move the app's state (onboarding and versions) from the settings' internal section to AppState, the app shell's state from the settings' _meta to AppState, every pack's plugin settings onto their plugins' refs and every written entity's content key and hash onto their names; drop the records each pack's applied content replaced",
  up: () => {
    renameStateRecords();
    renameContentAttributes();
    moveAppState();
    const owners = ownersIn(registry, installed());
    moveShellState(owners);
    // Every pack's plugin settings too, the built-in packs' included, before any pack's migration reads them
    movePluginSettings(owners);
  },
});

/**
 * **The one place in the tree that still says `seed`, and it has to.** Every string below is a key the data
 * on a user's disk was written under, so each is the thing this migration exists to find: renaming one
 * would make it match nothing and the record it moves would be lost. Nothing else here keeps the word —
 * the constants, the function and the prose are named for what they do.
 *
 * **It goes when this migration goes** (`../CLAUDE.md`: delete it with the others once 0.4.0 is below the
 * oldest version upgrades are supported from), and the last `seed` in the repo goes with it.
 *
 * Every name a per-pack record of an apply has been stored under, onto the one that carries one now.
 * `appState` reads only the names it knows, so a record under any other name is invisible to it.
 *
 * **One name is left to carry**, because the record of what a pack's content last applied is no longer in
 * `AppState` at all: it is the pack's `AppliedContent.revision`, beside the per-item account that makes an
 * apply a three-way merge (`../../app-state/applied-content.ts`). There is nothing to move a bare hash onto
 * — an entry with a revision and no items would read as a pack that wrote nothing — so the three old hash
 * records are dropped and the first boot after this applies each pack's content once, which is what writes
 * the record. That costs an adoption: an item the user edited before anything recorded *which part* they
 * edited is taken as ours and overwritten. That is the merge's rule for an item it has no parts for
 * (`@apack/sdk/content`'s `resolve`), and the alternative is freezing every such item for good.
 *
 * **`failedAgainst` is deliberately not in here.** It is the name the row carries *now*, so `appState`
 * already reads it: an entry would read the attribute, write it back unchanged and then `drop` it, which
 * deletes the record this migration exists to preserve.
 */
const RENAMED_STATE_RECORDS = {
  externalSeedDeps: 'failedAgainst',
  packSeedDeps: 'failedAgainst',
} as const satisfies Record<string, keyof AppState>;

/**
 * Records the row stops carrying, under every stored name they have had.
 *
 * `packSeedHashes`, `seedHashes`, `builtInSeedHashes` and `externalSeedHashes` were what each kind of pack
 * last applied, under the four names that record has had; what says it now is each pack's
 * `AppliedContent.revision`, which only an apply can write.
 *
 * `seedStatFingerprints` held each built-in pack's compiled files' mtimes and sizes, as a fast path in front of
 * the content hash — which measures 0.39ms over default-setup's 490KB against 0.07ms to stat the same
 * files, so it saved a third of a millisecond of a boot and cost a second record that could disagree with
 * the first. An earlier run of this migration moved it to `builtInSeedFingerprints`, so both names are
 * dropped. `packSeedKeys` is the same shape: the keys a pack's content defined, which the applied content's
 * items answer per item rather than as a list.
 */
const DROPPED_STATE_RECORDS = [
  'packSeedHashes', 'seedHashes', 'builtInSeedHashes', 'externalSeedHashes',
  'seedStatFingerprints', 'builtInSeedFingerprints', 'packSeedKeys',
] as const;

/**
 * The two attributes an apply stamps on every entity it writes, under the names they have had.
 *
 * They are the app's, not any one pack's: every pack's content carries them, and which entity types exist
 * is something only the registry knows — which is why this is a host migration rather than a line in each
 * pack's. `seed` left the vocabulary, and `source` meant "the authored file" here while it means a logger
 * or an event source everywhere else in the app.
 */
const RENAMED_CONTENT_ATTRIBUTES = { seedKey: 'contentKey', sourceHash: 'contentHash' } as const;

/**
 * Renames them on **every entity in the database**, which is what `qx()` with no start gives.
 *
 * Not a walk over the registered entity types, which is what this was and which misses exactly the
 * entities nobody can fix later: a pack disabled or failing to load at this boot registers no types, its
 * types are not types as far as the engine is concerned (`isEntityType`), so `qx(type)` reads the name as
 * an id and finds nothing — and the migration records its version and never runs again. The pack's items
 * would carry the old names for good, which the next apply reads as entities carrying no hash of ours:
 * user-owned, left alone, never updated again. That is the freeze this release exists to end, kept alive
 * for whichever pack happened to be off.
 *
 * Asking every entity costs no more than asking each registered type, since that visited every entity of
 * every type; it simply stops the population being a question.
 *
 * Idempotent, and in the safe order for a run that dies half way: the new name is written before the old
 * one is dropped, so an interrupted run leaves an entity carrying both and the next pass finishes it. An
 * entity that already holds the new name is left alone, which is what makes a second run free.
 */
function renameContentAttributes(): void {
  let moved = 0;
  // Untyped and unstarted: these are attributes the app stamps, not fields any pack declares, so which
  // entity types exist decides nothing about where they are
  for (const row of untypedQx().pickAll() as Array<Record<string, unknown>>) {
    const id = row.id as EARS.EntityId;
    for (const [from, to] of Object.entries(RENAMED_CONTENT_ATTRIBUTES)) {
      if (row[from] == null || row[to] != null) continue;
      untypedTx(id).update(to, row[from]);
      untypedTx(id).drop(from);
      moved++;
    }
  }
  if (moved > 0) console.log(`[migration 0.4.0] renamed ${moved} content attribute(s)`);
}

/** Moves each old-named record onto its new field, keeping what the new one already holds, and drops the ones this
 *  version no longer keeps. Idempotent: every name is removed as it is handled, so a second run finds nothing. */
function renameStateRecords(): void {
  const old = [...Object.keys(RENAMED_STATE_RECORDS), ...DROPPED_STATE_RECORDS];
  const row = untypedQx(APP_STATE_ID).pickOne(old) as Record<string, Record<string, string> | null | undefined> | undefined;
  if (!row) return;

  const current = appState.get();
  const moved: Partial<AppState> = {};
  const tx = untypedTx(APP_STATE_ID);
  for (const [from, to] of Object.entries(RENAMED_STATE_RECORDS)) {
    const value = row[from];
    // `drop` leaves the attribute as null rather than removing the key, so null is "already moved"
    if (value == null) continue;
    // Over what this loop has already moved, not only over what the row holds: two old names may reach one
    // field, and reading `current` each time would have the last one win
    moved[to] = withMissing(moved[to] ?? current[to], value);
    tx.drop(from);
  }
  // Dropped rather than moved: nothing reads them, so carrying them forward would leave the row holding a
  // record with no reader
  for (const gone of DROPPED_STATE_RECORDS) {
    if (row[gone] == null) continue;
    tx.drop(gone);
  }
  if (Object.keys(moved).length > 0) appState.update(moved);
}

function moveAppState(): void {
  const internal = legacyInternal();
  if (!internal) return;
  const current = appState.get();

  const moved: Partial<AppState> = {
    packVersions: withMissing(current.packVersions, internal.packVersions),
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

/** What the settings row held before 0.4.0 under `plugins._meta`: the app shell's state, by bare plugin id */
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
  shipped: readonly string[];
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
  return { refs: refs as FeatureRef[], shipped: [HOST_PACK_ID, ...registry.shippedPacks().map(({ id }) => id)] };
}

/**
 * The refs of the features a manifest on disk lists. Read as data, not trusted as a manifest: a malformed one lists
 * none rather than throwing, because a thrown migration stops every boot's migrations and content until it is fixed, and
 * one broken pack on disk mustn't do that to the app. Its keys stay as they are.
 */
function declaredFeatureRefs(manifest: { id?: unknown; features?: unknown }): string[] {
  const features = manifest.features;
  if (typeof manifest.id !== 'string' || typeof features !== 'object' || features === null || Array.isArray(features)) return [];
  return Object.keys(features).map((id) => `${manifest.id}/${id}`);
}

/** Each bare feature id to its owner's ref, or null when no single one owns it (two external packs share it) */
function ownersOf({ refs, shipped }: PluginOwners): Map<string, FeatureRef | null> {
  const byFeature = new Map<string, FeatureRef[]>();
  for (const ref of refs) {
    const parts = splitRef(ref);
    if (parts) byFeature.set(parts.featureId, [...(byFeature.get(parts.featureId) ?? []), ref]);
  }
  const owners = new Map<string, FeatureRef | null>();
  for (const [featureId, candidates] of byFeature) {
    const shippedOnes = candidates.filter((ref) => shipped.includes(splitRef(ref)!.packId));
    owners.set(featureId, candidates.length === 1 ? candidates[0] : shippedOnes.length === 1 ? shippedOnes[0] : null);
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
 * Every pack's plugin settings, stored under their features' bare ids before 0.4.0, onto their refs. A bare key no
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
