// The app's own state: one AppState row the host declares and alone reads and writes. Packs never read
// it; they learn whether the user onboarded through services.appData, and the renderer through the
// application plugin's CLIENT_CONNECTED. Resetting the user's settings doesn't touch it; resetting the
// app (appData.reset()) empties it with everything else.
import { tx, untypedQx } from '@abuddy/ears';
import type { EARS } from '@abuddy/sdk';

/** The entity type the host declares, next to the SDK's */
export const APP_STATE_ENTITY = 'AppState';

/** The entity types the host declares; no pack may declare them */
export const HOST_ENTITY_TYPES: readonly string[] = [APP_STATE_ENTITY];

const APP_STATE_ID = `${APP_STATE_ENTITY}-app` as EARS.EntityId;

export interface AppState {
  /** Whether the user finished onboarding */
  hasOnboarded: boolean;
  /** The app version the data was last migrated to; absent until the first migrations run records it */
  version?: string;
  /** Each external pack's version its migrations last ran to, by pack id */
  packVersions: Record<string, string>;
  /** Each external pack's compiled seed data last seeded, by pack id */
  packSeedHashes: Record<string, string>;
  /** Each built-in pack's boot seed last seeded, by pack id: the hash of its compiled data */
  seedHashes: Record<string, string>;
  /** The file mtimes and sizes each built-in pack's seed hash was computed from (the fast path that skips re-hashing) */
  seedStatFingerprints: Record<string, string>;
}

const FIELDS = ['hasOnboarded', 'version', 'packVersions', 'packSeedHashes', 'seedHashes', 'seedStatFingerprints'] as const;

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
      seedHashes: row.seedHashes ?? {},
      seedStatFingerprints: row.seedStatFingerprints ?? {},
    };
  },

  /** Writes the given fields, creating the row on the first write */
  update: (changes: Partial<AppState>): void => {
    const write = stored() === undefined
      ? tx(APP_STATE_ID, true).put('entityType', APP_STATE_ENTITY)
      : tx(APP_STATE_ID);
    for (const [field, value] of Object.entries(changes)) {
      if (value !== undefined) write.update(field, value);
    }
  },

  /** Records one pack's entry in a per-pack field without disturbing the others' */
  updatePackEntry: (field: 'packVersions' | 'packSeedHashes' | 'seedHashes' | 'seedStatFingerprints', packId: string, value: string): void => {
    appState.update({ [field]: { ...appState.get()[field], [packId]: value } });
  },
};
