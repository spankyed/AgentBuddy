// The app's own state: one AppState row the host declares and alone reads and writes. Packs never read
// it; they learn whether the user onboarded through services.appData, and the renderer through the
// application plugin's CLIENT_CONNECTED. Resetting the user's settings doesn't touch it; resetting the
// app (appData.reset()) empties it with everything else.
import { untypedTx, untypedQx } from '@abuddy/ears';
import type { EARS } from '@abuddy/sdk';
import { SETTINGS_ENTITY } from '../features/settings/be/store.ts';

/** The entity type the host declares, next to the SDK's */
export const APP_STATE_ENTITY = 'AppState';

/** The entity types the host declares — its state and the settings row; no pack may declare them */
export const HOST_ENTITY_TYPES: readonly string[] = [APP_STATE_ENTITY, SETTINGS_ENTITY];

const APP_STATE_ID = `${APP_STATE_ENTITY}-app` as EARS.EntityId;

export interface AppState {
  /** Whether the user finished onboarding */
  hasOnboarded: boolean;
  /** The app version the data was last migrated to; absent until the first migrations run records it */
  version?: string;
  /**
   * Each external pack's version its migrations last ran to, by pack id.
   *
   * Kept when the pack is uninstalled, along with `packSeedHashes`: these say what has been done to the
   * data, and uninstalling a pack deletes its directory, not its rows. Forgetting them would run a
   * reinstalled pack's migrations again over data they have already moved. A pack reinstalled at the
   * version it was therefore neither migrates nor re-seeds — `services.appData` re-imports its seeds if
   * the rows really are gone.
   */
  packVersions: Record<string, string>;
  /** Each external pack's compiled seed data last seeded, by pack id. Kept on uninstall; see above */
  packSeedHashes: Record<string, string>;
  /**
   * For each external pack whose last seed failed, the seed state of the packs it depends on at that
   * moment. A pack that seeded cleanly has no entry.
   *
   * It is what makes a failed seed retryable without re-importing it on every boot: the pack's own hash
   * says its data hasn't changed, and this says whether anything it depends on has seeded since — the
   * other thing that could change the outcome.
   */
  packSeedDeps: Record<string, string>;
  /** Each built-in pack's boot seed last seeded, by pack id: the hash of its compiled data */
  seedHashes: Record<string, string>;
  /** The file mtimes and sizes each built-in pack's seed hash was computed from (the fast path that skips re-hashing) */
  seedStatFingerprints: Record<string, string>;
  /**
   * The plugins whose sidebar tab the user showed or hid, by ref. A plugin not here shows as its feature declares
   * (`features[].settings`' `visible`), so a pack's default reaches everyone who never touched its tab.
   */
  pluginVisibility: Record<string, boolean>;
  /** The plugin the user last had open, by ref; a window opens on it once it connects */
  lastActivePlugin?: string;
}

const FIELDS = [
  'hasOnboarded', 'version', 'packVersions', 'packSeedHashes', 'packSeedDeps', 'seedHashes', 'seedStatFingerprints',
  'pluginVisibility', 'lastActivePlugin',
] as const satisfies readonly (keyof AppState)[];

/**
 * `FIELDS` is what `stored()` reads back, so a field the interface has and this list lacks is written and
 * then always reads as its default — no type error, and only a round-trip test would notice. This makes
 * the omission a build failure naming the field.
 */
type UnreadField = Exclude<keyof AppState, (typeof FIELDS)[number]>;
const _everyFieldIsRead: [UnreadField] extends [never] ? true : UnreadField = true;
void _everyFieldIsRead;

/** The fields holding one entry per pack, from the shape rather than a list of their names */
type PerPackField = { [K in keyof AppState]-?: AppState[K] extends Record<string, string> ? K : never }[keyof AppState];

type StoredAppState = Partial<AppState>;

function stored(): StoredAppState | undefined {
  return untypedQx(APP_STATE_ID).pickOne([...FIELDS]) as StoredAppState | undefined ?? undefined;
}

export const appState = {
  /** Whether the row exists: data from before AppState, or no data at all, has none */
  exists: (): boolean => stored() !== undefined,

  /** The app's state; fields never written read as their defaults */
  get: (): AppState => {
    const row = stored() ?? {};
    return {
      hasOnboarded: row.hasOnboarded ?? false,
      ...(row.version !== undefined && { version: row.version }),
      packVersions: row.packVersions ?? {},
      packSeedHashes: row.packSeedHashes ?? {},
      packSeedDeps: row.packSeedDeps ?? {},
      seedHashes: row.seedHashes ?? {},
      seedStatFingerprints: row.seedStatFingerprints ?? {},
      pluginVisibility: row.pluginVisibility ?? {},
      ...(row.lastActivePlugin != null && { lastActivePlugin: row.lastActivePlugin }),
    };
  },

  /** Writes the given fields, creating the row on the first write */
  update: (changes: Partial<AppState>): void => {
    const write = stored() === undefined
      ? untypedTx(APP_STATE_ID, true).put('entityType', APP_STATE_ENTITY)
      : untypedTx(APP_STATE_ID);
    for (const [field, value] of Object.entries(changes)) {
      if (value !== undefined) write.update(field, value);
    }
  },

  /** Records one pack's entry in a per-pack field, or with `undefined` removes it, leaving the others' alone */
  updatePackEntry: (field: PerPackField, packId: string, value: string | undefined): void => {
    const entries = { ...appState.get()[field] };
    if (value === undefined) delete entries[packId];
    else entries[packId] = value;
    appState.update({ [field]: entries });
  },
};
